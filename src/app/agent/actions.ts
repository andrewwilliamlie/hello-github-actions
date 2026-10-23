"use server";
import { headers } from "next/headers";
import { runAction, str } from "@/server/action";
import { fileFromFormData } from "@/server/storage/files";
import { invalid } from "@/server/errors";
import { acceptAgreement, addBankAccount, setWhatsappOptIn, submitKyc } from "@/server/modules/agents";
import { agentLeadTransition, createLead, submitPayment, updateLead, uploadLeadDocument, type LeadInput } from "@/server/modules/merchants";
import { cancelWithdrawal, requestWithdrawal } from "@/server/modules/withdrawals";
import { disputeCommission } from "@/server/modules/commissions";
import { markNotificationsRead } from "@/server/modules/notifications";
import { changePassword, setLocale } from "@/server/modules/auth-flow";
import { toRupiah } from "@/lib/money";
import type { MerchantDocumentType, PaymentMethod } from "@prisma/client";

const P = ["/agent"];

export async function submitKycAction(form: FormData) {
  return runAction(async (actor) => {
    const idCard = await fileFromFormData(form, "idCard");
    const selfie = await fileFromFormData(form, "selfie");
    if (!idCard || !selfie) throw invalid("Unggah foto KTP dan selfie.");
    await submitKyc(actor, { idNumber: str(form, "idNumber"), idCard, selfie });
  }, { revalidate: P, message: "KTP terkirim untuk diverifikasi" });
}

export async function addBankAction(form: FormData) {
  return runAction((actor) => addBankAccount(actor, { bankCode: str(form, "bankCode"), accountHolderName: str(form, "accountHolderName"), accountNumber: str(form, "accountNumber") }), { revalidate: P, message: "Rekening ditambahkan, menunggu verifikasi" });
}

export async function acceptAgreementAction() {
  const h = await headers();
  return runAction((actor) => acceptAgreement(actor, { ip: actor.ip ?? null, userAgent: h.get("user-agent") }), { revalidate: P, message: "Perjanjian diterima" });
}

export async function whatsappOptInAction(input: Record<string, string>) {
  return runAction((actor) => setWhatsappOptIn(actor, input.optIn === "true"), { revalidate: P, message: "Preferensi disimpan" });
}

export async function createLeadAction(input: LeadInput) {
  return runAction(async (actor) => {
    const lead = await createLead(actor, input);
    return { id: lead.id };
  }, { revalidate: P, message: "Lead merchant dibuat" });
}

export async function updateLeadAction(leadId: string, input: LeadInput) {
  return runAction(async (actor) => {
    await updateLead(actor, leadId, input);
    return { id: leadId };
  }, { revalidate: P, message: "Lead diperbarui" });
}

export async function uploadLeadDocAction(form: FormData) {
  return runAction(async (actor) => {
    const file = await fileFromFormData(form, "file");
    if (!file) throw invalid("Pilih berkas.");
    await uploadLeadDocument(actor, str(form, "leadId"), str(form, "type") as MerchantDocumentType, file);
  }, { revalidate: P, message: "Dokumen diunggah" });
}

export async function leadTransitionAction(input: Record<string, string>) {
  return runAction((actor) => agentLeadTransition(actor, input.leadId, input.action as "contacted" | "submit" | "cancel"), { revalidate: P, message: "Status diperbarui" });
}

export async function submitPaymentAction(form: FormData) {
  return runAction(async (actor) => {
    let amount: bigint;
    try {
      amount = toRupiah(str(form, "amount"));
    } catch {
      throw invalid("Jumlah tidak valid.");
    }
    const proof = await fileFromFormData(form, "proof");
    await submitPayment(actor, str(form, "orderId"), { amount, method: str(form, "method") as PaymentMethod, reference: str(form, "reference"), payerName: str(form, "payerName") || undefined, proof: proof ?? undefined });
  }, { revalidate: P, message: "Bukti pembayaran terkirim" });
}

export async function requestWithdrawalAction(form: FormData) {
  return runAction(async (actor) => {
    let amount: bigint;
    try {
      amount = toRupiah(str(form, "amount"));
    } catch {
      throw invalid("Jumlah tidak valid.");
    }
    await requestWithdrawal(actor, { amount, idempotencyKey: str(form, "idempotencyKey") });
  }, { revalidate: P, message: "Permintaan penarikan dibuat" });
}

export async function cancelWithdrawalAction(input: Record<string, string>) {
  return runAction((actor) => cancelWithdrawal(actor, input.withdrawalId), { revalidate: P, message: "Penarikan dibatalkan" });
}

export async function disputeAction(input: Record<string, string>) {
  return runAction(async (actor) => {
    if ((input.reason ?? "").trim().length < 10) throw invalid("Jelaskan sengketa (min. 10 karakter).");
    await disputeCommission(actor, input.eventId, input.reason);
  }, { revalidate: P, message: "Sengketa diajukan" });
}

export async function markReadAction() {
  return runAction((actor) => markNotificationsRead(actor), { revalidate: P, message: "Semua notifikasi ditandai dibaca" });
}

export async function changePasswordAction(form: FormData) {
  return runAction((actor) => changePassword(actor, str(form, "current"), str(form, "next")), { message: "Kata sandi diubah. Silakan masuk kembali." });
}

export async function setLocaleAction(input: Record<string, string>) {
  return runAction((actor) => setLocale(actor, input.locale === "en" ? "en" : "id"), { revalidate: P, message: "Bahasa disimpan" });
}
