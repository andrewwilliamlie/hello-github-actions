"use server";
import type { AgentStatus, ImportType, RoleKey } from "@prisma/client";
import { runAction, str } from "@/server/action";
import { invalid } from "@/server/errors";
import { fileFromFormData } from "@/server/storage/files";
import { reassignReferrer, reviewBankAccount, reviewKyc, setAgentStatus } from "@/server/modules/agents";
import { activateDevice, assignDevice, changeAttribution, createMerchantPortalUser, markDeviceFaulty, receiveDevices, refundOrder, reviewLead, setMerchantSuspended, verifyPayment } from "@/server/modules/merchants";
import { setProductPrice, upsertProduct } from "@/server/modules/products";
import { createRuleVersion, decideRule, retireRule, submitRule, type RuleInput } from "@/server/modules/rules";
import { approveCommissions, releaseCommissions, resolveDispute, reverseCommission } from "@/server/modules/commissions";
import { resolveFraudFlag } from "@/server/modules/fraud";
import { resolveException, runReconciliation, ingestTransactions } from "@/server/modules/transactions";
import { cancelImport, commitImport, createImport } from "@/server/modules/imports";
import { approvePayoutBatch, cancelPayoutBatch, confirmPayoutTransfer, createPayoutBatch, failPayoutAttempt, recordPayoutTransfer, retryPayout, returnFailedWithdrawal, reviewWithdrawal } from "@/server/modules/withdrawals";
import { createApiClient, replayWebhook, revokeApiClient } from "@/server/modules/integrations";
import { updateSetting } from "@/server/settings";
import { createAdminUser, resetUserMfa, setUserDisabled, setUserRoles } from "@/server/modules/users";
import { markNotificationsRead } from "@/server/modules/notifications";
import { toRupiah } from "@/lib/money";
import { startOfJakartaDay } from "@/lib/time";
import { parseTimestamp } from "@/server/modules/transactions";
import { prisma } from "@/server/db";

const A = ["/admin"];
type In = Record<string, string>;

// Agents & KYC
export async function agentStatusAction(i: In) {
  return runAction((a) => setAgentStatus(a, i.agentId, i.status as AgentStatus, i.reason || undefined), { revalidate: A, message: "Status agen diperbarui" });
}
export async function kycReviewAction(i: In) {
  return runAction((a) => reviewKyc(a, i.agentId, i.decision as "VERIFIED" | "REJECTED", i.reason || undefined), { revalidate: A, message: "KYC ditinjau" });
}
export async function bankReviewAction(i: In) {
  return runAction((a) => reviewBankAccount(a, i.bankAccountId, i.decision as "VERIFIED" | "REJECTED", i.reason || undefined), { revalidate: A, message: "Rekening ditinjau" });
}
export async function reassignReferrerAction(i: In) {
  return runAction(async (a) => {
    const code = i.value?.trim().toUpperCase();
    let referrerId: string | null = null;
    if (code) {
      const ref = await prisma.agent.findFirst({ where: { OR: [{ agentCode: code }, { referralCode: code }] } });
      if (!ref) throw invalid("Agen dengan kode tersebut tidak ditemukan.");
      referrerId = ref.id;
    }
    await reassignReferrer(a, i.recruitAgentId, referrerId, i.reason);
  }, { revalidate: A, message: "Referrer diperbarui" });
}

// Merchants & orders
export async function leadReviewAction(i: In) {
  return runAction((a) => reviewLead(a, i.leadId, i.decision as "start_review" | "request_revision" | "reject" | "approve", i.reason), { revalidate: A, message: "Aplikasi diperbarui" });
}
export async function verifyPaymentAction(i: In) {
  return runAction((a) => verifyPayment(a, i.paymentId, i.decision as "VERIFIED" | "REJECTED"), { revalidate: A, message: "Pembayaran diproses" });
}
export async function assignDeviceAction(form: FormData) {
  return runAction((a) => assignDevice(a, str(form, "orderId"), str(form, "deviceId")), { revalidate: A, message: "Perangkat ditetapkan" });
}
export async function activateDeviceAction(form: FormData) {
  return runAction(async (a) => {
    const when = str(form, "activatedAt");
    const at = when ? parseTimestamp(when.replace("T", " ")) : undefined;
    if (when && !at) throw invalid("Waktu aktivasi tidak valid.");
    return activateDevice(a, str(form, "orderId"), { terminalId: str(form, "terminalId"), activatedAt: at ?? undefined });
  }, { revalidate: A, message: "Perangkat diaktivasi — komisi penjualan dicatat" });
}
export async function refundOrderAction(i: In) {
  return runAction((a) => refundOrder(a, i.orderId, i.reason), { revalidate: A, message: "Pesanan dikembalikan dan komisi dibatalkan" });
}
export async function merchantSuspendAction(i: In) {
  return runAction((a) => setMerchantSuspended(a, i.merchantId, i.suspend === "true", i.reason), { revalidate: A, message: "Status merchant diperbarui" });
}
export async function changeAttributionAction(i: In) {
  return runAction(async (a) => {
    const agent = await prisma.agent.findUnique({ where: { agentCode: (i.value ?? "").trim().toUpperCase() } });
    if (!agent) throw invalid("Kode agen tidak ditemukan.");
    await changeAttribution(a, i.merchantId, agent.id, i.reason);
  }, { revalidate: A, message: "Atribusi diubah" });
}
export async function merchantPortalUserAction(form: FormData) {
  return runAction((a) => createMerchantPortalUser(a, str(form, "merchantId"), str(form, "email")), { revalidate: A, message: "Akun portal dibuat — catat kata sandi sementara" });
}

// Inventory & catalog
export async function receiveDevicesAction(form: FormData) {
  return runAction((a) => receiveDevices(a, str(form, "productId"), str(form, "serials").split(/[\s,;]+/)), { revalidate: A, message: "Perangkat diterima" });
}
export async function faultyDeviceAction(i: In) {
  return runAction((a) => markDeviceFaulty(a, i.deviceId, i.reason), { revalidate: A, message: "Perangkat ditandai rusak" });
}
export async function saveProductAction(form: FormData) {
  return runAction(async (a) => {
    const specs = str(form, "specs").split("\n").map((l) => l.split(":")).filter((p) => p.length >= 2 && p[0].trim()).map(([label, ...rest]) => ({ label: label.trim(), value: rest.join(":").trim() }));
    const p = await upsertProduct(a, str(form, "id") || null, {
      sku: str(form, "sku"), name: str(form, "name"), category: str(form, "category") as "EDC_ANDROID", description: str(form, "description"), specs, imageUrl: str(form, "imageUrl"), isActive: form.get("isActive") === "on",
    });
    return { id: p.id };
  }, { revalidate: A, message: "Produk disimpan" });
}
export async function setPriceAction(form: FormData) {
  return runAction(async (a) => {
    let price: bigint;
    try {
      price = toRupiah(str(form, "price"));
    } catch {
      throw invalid("Harga tidak valid.");
    }
    const day = str(form, "effectiveFrom");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw invalid("Tanggal berlaku tidak valid.");
    await setProductPrice(a, str(form, "productId"), price, startOfJakartaDay(day));
  }, { revalidate: A, message: "Harga baru dijadwalkan" });
}

// Rules
export async function createRuleAction(input: RuleInput) {
  return runAction(async (a) => ({ id: (await createRuleVersion(a, input)).id }), { revalidate: A, message: "Draf aturan dibuat" });
}
export async function ruleSubmitAction(i: In) {
  return runAction((a) => submitRule(a, i.ruleId), { revalidate: A, message: "Diajukan untuk persetujuan" });
}
export async function ruleDecideAction(i: In) {
  return runAction((a) => decideRule(a, i.ruleId, i.decision as "approve" | "reject"), { revalidate: A, message: "Keputusan disimpan" });
}
export async function ruleRetireAction(i: In) {
  return runAction((a) => retireRule(a, i.ruleId), { revalidate: A, message: "Aturan dipensiunkan" });
}

// Commissions
export async function releaseAction() {
  return runAction(async (a) => {
    const s = await releaseCommissions(a);
    return s;
  }, { revalidate: A, message: "Proses rilis komisi selesai" });
}
export async function approveCommissionAction(i: In) {
  return runAction((a) => approveCommissions(a, i.ids.split(",")), { revalidate: A, message: "Komisi disetujui" });
}
export async function reverseCommissionAction(i: In) {
  return runAction((a) => reverseCommission(a, i.eventId, i.reason), { revalidate: A, message: "Komisi dibatalkan" });
}
export async function resolveDisputeAction(i: In) {
  return runAction((a) => resolveDispute(a, i.disputeId, i.outcome as "UPHOLD_COMMISSION" | "REVERSE_COMMISSION" | "REJECT", i.reason), { revalidate: A, message: "Sengketa diselesaikan" });
}
export async function resolveFraudAction(i: In) {
  return runAction((a) => resolveFraudFlag(a, i.flagId, i.outcome as "CLEARED" | "CONFIRMED", i.reason), { revalidate: A, message: "Tanda risiko diperbarui" });
}

// Transactions, imports, reconciliation
export async function ingestManualAction(form: FormData) {
  return runAction(async (a) => {
    let items: unknown;
    try {
      items = JSON.parse(str(form, "payload"));
    } catch {
      throw invalid("JSON tidak valid.");
    }
    return ingestTransactions(a, str(form, "source").toUpperCase(), Array.isArray(items) ? items : [items], "API");
  }, { revalidate: A, message: "Transaksi diproses" });
}
export async function runReconAction(form: FormData) {
  return runAction((a) => runReconciliation(a, str(form, "date")), { revalidate: A, message: "Rekonsiliasi selesai" });
}
export async function resolveExceptionAction(i: In) {
  return runAction((a) => resolveException(a, i.exceptionId, i.action as "ignore" | "accept_settlement" | "retry", i.reason), { revalidate: A, message: "Pengecualian diperbarui" });
}
export async function createImportAction(form: FormData) {
  return runAction(async (a) => {
    const file = await fileFromFormData(form, "file");
    if (!file) throw invalid("Pilih berkas CSV/XLSX.");
    const imp = await createImport(a, { type: str(form, "type") as ImportType, source: str(form, "source"), file });
    return { id: imp.id };
  }, { revalidate: A, message: "Berkas divalidasi — tinjau pratinjau sebelum menerapkan" });
}
export async function commitImportAction(i: In) {
  return runAction((a) => commitImport(a, i.importId), { revalidate: A, message: "Impor diterapkan" });
}
export async function cancelImportAction(i: In) {
  return runAction((a) => cancelImport(a, i.importId), { revalidate: A, message: "Impor dibatalkan" });
}

// Withdrawals & payouts
export async function reviewWithdrawalAction(i: In) {
  return runAction((a) => reviewWithdrawal(a, i.withdrawalId, i.decision as "APPROVED" | "REJECTED", i.reason || undefined), { revalidate: A, message: "Penarikan ditinjau" });
}
export async function createBatchAction(i: In) {
  return runAction(async (a) => ({ id: (await createPayoutBatch(a, i.ids.split(",").filter(Boolean), i.reason || undefined)).id }), { revalidate: A, message: "Batch dibuat — perlu persetujuan pengguna lain" });
}
export async function approveBatchAction(i: In) {
  return runAction((a) => approvePayoutBatch(a, i.batchId), { revalidate: A, message: "Batch disetujui" });
}
export async function cancelBatchAction(i: In) {
  return runAction((a) => cancelPayoutBatch(a, i.batchId, i.reason), { revalidate: A, message: "Batch dibatalkan" });
}
export async function recordTransferAction(form: FormData) {
  return runAction(async (a) => {
    const proof = await fileFromFormData(form, "proof");
    await recordPayoutTransfer(a, str(form, "attemptId"), { providerReference: str(form, "providerReference"), proof: proof ?? undefined });
  }, { revalidate: A, message: "Transfer dicatat — menunggu konfirmasi pengguna lain" });
}
export async function confirmTransferAction(i: In) {
  return runAction((a) => confirmPayoutTransfer(a, i.attemptId), { revalidate: A, message: "Pembayaran terkonfirmasi" });
}
export async function failTransferAction(i: In) {
  return runAction((a) => failPayoutAttempt(a, i.attemptId, i.reason), { revalidate: A, message: "Transfer ditandai gagal" });
}
export async function retryPayoutAction(i: In) {
  return runAction((a) => retryPayout(a, i.withdrawalId), { revalidate: A, message: "Percobaan baru dibuat" });
}
export async function returnFundsAction(i: In) {
  return runAction((a) => returnFailedWithdrawal(a, i.withdrawalId, i.reason), { revalidate: A, message: "Dana dikembalikan ke saldo agen" });
}

// Platform
export async function updateSettingAction(form: FormData) {
  return runAction(async (a) => {
    const raw = str(form, "value");
    let value: unknown = raw;
    const kind = str(form, "kind");
    if (kind === "number") value = Number(raw);
    else if (kind === "boolean") value = raw === "true";
    else if (kind === "array") value = raw.split(",").map((x) => x.trim()).filter(Boolean);
    await updateSetting(a, str(form, "key"), value);
  }, { revalidate: A, message: "Pengaturan disimpan" });
}
export async function createAdminUserAction(form: FormData) {
  return runAction(async (a) => {
    await createAdminUser(a, { name: str(form, "name"), email: str(form, "email"), password: str(form, "password"), roles: form.getAll("roles").map(String) as RoleKey[] });
  }, { revalidate: A, message: "Pengguna admin dibuat" });
}
export async function setUserRolesAction(i: In) {
  return runAction((a) => setUserRoles(a, i.userId, i.value.split(",").map((x) => x.trim().toUpperCase()).filter(Boolean) as RoleKey[]), { revalidate: A, message: "Peran diperbarui" });
}
export async function toggleUserAction(i: In) {
  return runAction((a) => setUserDisabled(a, i.userId, i.disabled === "true"), { revalidate: A, message: "Status pengguna diperbarui" });
}
export async function resetMfaAction(i: In) {
  return runAction((a) => resetUserMfa(a, i.userId), { revalidate: A, message: "MFA direset" });
}
export async function createApiClientAction(form: FormData) {
  return runAction(async (a) => {
    const r = await createApiClient(a, { name: str(form, "name"), partnerSource: str(form, "partnerSource"), scopes: ["transactions:write", "settlements:write"] });
    return { apiKey: r.apiKey, webhookSecret: r.webhookSecret };
  }, { revalidate: A, message: "API client dibuat" });
}
export async function revokeApiClientAction(i: In) {
  return runAction((a) => revokeApiClient(a, i.clientId), { revalidate: A, message: "API client dicabut" });
}
export async function replayWebhookAction(i: In) {
  return runAction((a) => replayWebhook(a, i.webhookId), { revalidate: A, message: "Webhook dijadwalkan ulang" });
}
export async function adminMarkReadAction() {
  return runAction((a) => markNotificationsRead(a), { revalidate: A, message: "Ditandai dibaca" });
}
