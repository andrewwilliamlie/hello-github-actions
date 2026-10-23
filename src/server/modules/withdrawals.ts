import "server-only";
import { prisma, withTx, isUniqueViolation } from "../db";
import { cr, dr, lockWallet, postJournal } from "../ledger";
import { audit } from "../audit";
import { getSetting } from "../settings";
import { notifyRole, notifyUser } from "../notifications/notify";
import { refreshPaidStatuses } from "./commissions";
import { storeUpload } from "../storage/files";
import { decryptField } from "../crypto";
import { disbursementProvider } from "../payouts/provider";
import { requireAgent, requireDifferentUser, requirePermission, type Actor } from "../rbac";
import { AppError, conflict, invalid, notFound, rule } from "../errors";
import { formatRupiah } from "@/lib/money";
import { rateLimit } from "../auth/rate-limit";

// ─────────────────────────────── Agent side ───────────────────────────────

/**
 * Request a withdrawal of payable balance to the agent's verified bank account.
 * Guards: active agent, verified bank, min threshold, ≤ payable (wallet row lock), one open
 * withdrawal per agent (partial unique index), idempotency key (client-generated per form).
 */
export async function requestWithdrawal(actor: Actor, input: { amount: bigint; idempotencyKey: string }) {
  const agentId = requireAgent(actor);
  await rateLimit(`withdraw:${agentId}`, 10, 3600);
  if (!/^[\w-]{8,80}$/.test(input.idempotencyKey)) throw invalid("Idempotency key tidak valid.");
  const prior = await prisma.withdrawalRequest.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
  if (prior) {
    if (prior.agentId !== agentId) throw conflict("Idempotency key sudah digunakan.");
    return prior;
  }
  const min = BigInt(await getSetting("withdrawal.minAmountIdr"));
  if (input.amount < min) throw invalid(`Minimal penarikan ${formatRupiah(min)}.`);
  try {
    return await withTx(async (tx) => {
      const agent = await tx.agent.findUniqueOrThrow({ where: { id: agentId } });
      if (agent.status !== "ACTIVE") throw rule("Penarikan hanya untuk agen aktif.");
      const bank = await tx.agentBankAccount.findFirst({ where: { agentId, status: "VERIFIED" }, orderBy: { verifiedAt: "desc" } });
      if (!bank) throw rule("Rekening bank Anda belum terverifikasi.");
      const wallet = await lockWallet(tx, agentId);
      if (wallet.payableBalance < input.amount) throw new AppError("INSUFFICIENT_BALANCE", `Saldo dapat ditarik tidak mencukupi (tersedia ${formatRupiah(wallet.payableBalance)}).`);
      const open = await tx.withdrawalRequest.findFirst({ where: { agentId, status: { in: ["REQUESTED", "APPROVED", "IN_BATCH", "PROCESSING", "FAILED"] } } });
      if (open) throw conflict("Masih ada penarikan yang sedang diproses.");
      const w = await tx.withdrawalRequest.create({ data: { agentId, bankAccountId: bank.id, amount: input.amount, idempotencyKey: input.idempotencyKey } });
      await postJournal(tx, {
        journalRef: `WDRESERVE:${w.id}`, kind: "WITHDRAWAL_RESERVE", agentId, createdById: actor.userId, description: `Penarikan WD-${w.withdrawalNumber}`,
        lines: [dr("AGENT_PAYABLE", input.amount, { agentId, withdrawalId: w.id }), cr("AGENT_RESERVED", input.amount, { agentId, withdrawalId: w.id })],
      });
      await audit(tx, actor, { action: "withdrawal.request", entityType: "WithdrawalRequest", entityId: w.id, after: { amount: input.amount } });
      await notifyUser(tx, actor.userId!, "withdrawal.requested", { amount: formatRupiah(input.amount) }, "/agent/wallet");
      await notifyRole(tx, ["FINANCE_ADMIN"], "withdrawal.requested", { amount: formatRupiah(input.amount) }, "/admin/withdrawals");
      return w;
    });
  } catch (e) {
    if (isUniqueViolation(e)) {
      const again = await prisma.withdrawalRequest.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
      if (again && again.agentId === agentId) return again;
      throw conflict("Masih ada penarikan yang sedang diproses.");
    }
    throw e;
  }
}

async function releaseReserved(tx: Parameters<Parameters<typeof withTx>[0]>[0], w: { id: string; agentId: string; amount: bigint; withdrawalNumber: number }, actor: Actor, why: string) {
  await postJournal(tx, {
    journalRef: `WDRELEASE:${w.id}`, kind: "WITHDRAWAL_RELEASE", agentId: w.agentId, createdById: actor.userId, description: `Pengembalian dana WD-${w.withdrawalNumber}: ${why}`,
    lines: [dr("AGENT_RESERVED", w.amount, { agentId: w.agentId, withdrawalId: w.id }), cr("AGENT_PAYABLE", w.amount, { agentId: w.agentId, withdrawalId: w.id })],
  });
}

export async function cancelWithdrawal(actor: Actor, withdrawalId: string) {
  const agentId = requireAgent(actor);
  return withTx(async (tx) => {
    const w = await tx.withdrawalRequest.findUnique({ where: { id: withdrawalId } });
    if (!w || w.agentId !== agentId) throw notFound("Penarikan");
    const upd = await tx.withdrawalRequest.updateMany({ where: { id: w.id, status: "REQUESTED" }, data: { status: "CANCELLED" } });
    if (upd.count !== 1) throw rule("Penarikan hanya dapat dibatalkan sebelum ditinjau.");
    await releaseReserved(tx, w, actor, "dibatalkan agen");
    await audit(tx, actor, { action: "withdrawal.cancel", entityType: "WithdrawalRequest", entityId: w.id });
  });
}

// ─────────────────────────────── Finance review ───────────────────────────────

export async function reviewWithdrawal(actor: Actor, withdrawalId: string, decision: "APPROVED" | "REJECTED", reason?: string) {
  requirePermission(actor, "withdrawal.review");
  return withTx(async (tx) => {
    const w = await tx.withdrawalRequest.findUnique({ where: { id: withdrawalId }, include: { agent: true, bankAccount: true } });
    if (!w) throw notFound("Penarikan");
    if (decision === "REJECTED" && !reason) throw invalid("Alasan penolakan wajib diisi.");
    if (decision === "APPROVED") {
      if (w.agent.status !== "ACTIVE") throw rule("Agen tidak aktif.");
      if (w.bankAccount.status !== "VERIFIED") throw rule("Rekening tujuan tidak lagi terverifikasi.");
    }
    const upd = await tx.withdrawalRequest.updateMany({ where: { id: w.id, status: "REQUESTED" }, data: { status: decision, reviewedById: actor.userId, reviewedAt: new Date(), rejectionReason: reason ?? null } });
    if (upd.count !== 1) throw rule("Penarikan sudah ditinjau.");
    if (decision === "REJECTED") await releaseReserved(tx, w, actor, reason!);
    await audit(tx, actor, { action: `withdrawal.${decision.toLowerCase()}`, entityType: "WithdrawalRequest", entityId: w.id, after: { reason } });
    await notifyUser(tx, w.agent.userId, decision === "APPROVED" ? "withdrawal.approved" : "withdrawal.rejected", { amount: formatRupiah(w.amount), reason: reason ?? "" }, "/agent/wallet");
  });
}

// ─────────────────────────────── Payout batches (maker-checker) ───────────────────────────────

export async function createPayoutBatch(actor: Actor, withdrawalIds: string[], note?: string) {
  requirePermission(actor, "payout.create");
  if (!withdrawalIds.length) throw invalid("Pilih minimal satu penarikan.");
  return withTx(async (tx) => {
    const ws = await tx.withdrawalRequest.findMany({ where: { id: { in: withdrawalIds } } });
    if (ws.length !== withdrawalIds.length || ws.some((w) => w.status !== "APPROVED" || w.batchId)) throw rule("Semua penarikan harus berstatus disetujui dan belum masuk batch.");
    const total = ws.reduce((s, w) => s + w.amount, 0n);
    const batch = await tx.payoutBatch.create({ data: { totalAmount: total, itemCount: ws.length, createdById: actor.userId!, note } });
    const upd = await tx.withdrawalRequest.updateMany({ where: { id: { in: withdrawalIds }, status: "APPROVED", batchId: null }, data: { status: "IN_BATCH", batchId: batch.id } });
    if (upd.count !== ws.length) throw conflict("Sebagian penarikan sudah diproses oleh pengguna lain.");
    await audit(tx, actor, { action: "payout.batch.create", entityType: "PayoutBatch", entityId: batch.id, after: { total, count: ws.length } });
    await notifyRole(tx, ["FINANCE_ADMIN", "SUPER_ADMIN"], "withdrawal.approved", { amount: formatRupiah(total) }, `/admin/payouts/${batch.id}`);
    return batch;
  });
}

/** Checker approves (≠ maker). Creates one PENDING payout attempt per withdrawal. */
export async function approvePayoutBatch(actor: Actor, batchId: string) {
  requirePermission(actor, "payout.approve");
  return withTx(async (tx) => {
    const b = await tx.payoutBatch.findUnique({ where: { id: batchId }, include: { withdrawals: true } });
    if (!b) throw notFound("Batch");
    requireDifferentUser(b.createdById, actor, "Batch pembayaran");
    const upd = await tx.payoutBatch.updateMany({ where: { id: b.id, status: "PENDING_APPROVAL" }, data: { status: "APPROVED", approvedById: actor.userId, approvedAt: new Date() } });
    if (upd.count !== 1) throw rule("Batch tidak menunggu persetujuan.");
    for (const w of b.withdrawals) {
      await tx.payoutAttempt.create({ data: { withdrawalId: w.id, batchId: b.id, attemptNumber: 1, provider: b.provider, amount: w.amount } });
      await tx.withdrawalRequest.update({ where: { id: w.id }, data: { status: "PROCESSING" } });
    }
    await audit(tx, actor, { action: "payout.batch.approve", entityType: "PayoutBatch", entityId: b.id });
  });
}

export async function cancelPayoutBatch(actor: Actor, batchId: string, reason: string) {
  requirePermission(actor, "payout.create");
  return withTx(async (tx) => {
    const b = await tx.payoutBatch.findUnique({ where: { id: batchId } });
    if (!b) throw notFound("Batch");
    const upd = await tx.payoutBatch.updateMany({ where: { id: b.id, status: "PENDING_APPROVAL" }, data: { status: "CANCELLED", note: reason } });
    if (upd.count !== 1) throw rule("Hanya batch yang belum disetujui yang dapat dibatalkan.");
    await tx.withdrawalRequest.updateMany({ where: { batchId: b.id, status: "IN_BATCH" }, data: { status: "APPROVED", batchId: null } });
    await audit(tx, actor, { action: "payout.batch.cancel", entityType: "PayoutBatch", entityId: b.id, after: { reason } });
  });
}

/** Bank transfer instruction file for manual execution. Account numbers decrypted here only; audited. */
export async function exportPayoutInstructions(actor: Actor, batchId: string) {
  requirePermission(actor, "payout.export");
  const b = await prisma.payoutBatch.findUnique({ where: { id: batchId }, include: { attempts: { where: { status: "PENDING" }, include: { withdrawal: { include: { bankAccount: true } } } } } });
  if (!b) throw notFound("Batch");
  if (!["APPROVED", "PROCESSING", "PARTIALLY_FAILED"].includes(b.status)) throw rule("Batch belum disetujui.");
  const provider = disbursementProvider(b.provider);
  const res = await provider.prepare(
    b.attempts.map((a) => ({
      attemptId: a.id, withdrawalNumber: a.withdrawal.withdrawalNumber, amount: a.amount, bankCode: a.withdrawal.bankAccount.bankCode,
      bankName: a.withdrawal.bankAccount.bankName, accountHolderName: a.withdrawal.bankAccount.accountHolderName, accountNumber: decryptField(a.withdrawal.bankAccount.accountNumberEnc),
    })),
  );
  await audit(prisma, actor, { action: "payout.export", entityType: "PayoutBatch", entityId: b.id, metadata: { items: b.attempts.length } });
  if (!("content" in res)) throw rule("Penyedia otomatis tidak menghasilkan berkas.");
  return res;
}

/** Maker records that the manual transfer was executed: bank reference + proof. Not yet PAID. */
export async function recordPayoutTransfer(actor: Actor, attemptId: string, input: { providerReference: string; proof?: { buffer: Buffer; filename: string } }) {
  requirePermission(actor, "payout.record");
  const ref = input.providerReference.trim();
  if (ref.length < 4) throw invalid("Nomor referensi bank wajib diisi.");
  const proof = input.proof ? await storeUpload({ ...input.proof, purpose: "PAYOUT_PROOF", allowed: ["pdf", "png", "jpeg", "webp"], uploadedById: actor.userId }) : null;
  return withTx(async (tx) => {
    const dupRef = await tx.payoutAttempt.findFirst({ where: { providerReference: ref, status: { in: ["SUBMITTED", "CONFIRMED"] } } });
    if (dupRef) throw conflict("Referensi bank ini sudah dicatat untuk pembayaran lain.");
    const upd = await tx.payoutAttempt.updateMany({ where: { id: attemptId, status: "PENDING" }, data: { status: "SUBMITTED", providerReference: ref, proofFileId: proof?.id, recordedById: actor.userId, recordedAt: new Date() } });
    if (upd.count !== 1) throw rule("Percobaan pembayaran tidak dalam status menunggu transfer.");
    const a = await tx.payoutAttempt.findUniqueOrThrow({ where: { id: attemptId } });
    await tx.payoutBatch.updateMany({ where: { id: a.batchId, status: "APPROVED" }, data: { status: "PROCESSING" } });
    await audit(tx, actor, { action: "payout.record", entityType: "PayoutAttempt", entityId: attemptId, after: { providerReference: ref } });
  });
}

async function refreshBatchStatus(tx: Parameters<Parameters<typeof withTx>[0]>[0], batchId: string) {
  const ws = await tx.withdrawalRequest.findMany({ where: { batchId }, select: { status: true } });
  const done = ws.every((w) => ["PAID", "CANCELLED"].includes(w.status));
  const anyFailed = ws.some((w) => w.status === "FAILED" || w.status === "CANCELLED");
  if (done) await tx.payoutBatch.update({ where: { id: batchId }, data: { status: anyFailed ? "PARTIALLY_FAILED" : "COMPLETED", completedAt: new Date() } });
  else if (ws.some((w) => w.status === "FAILED")) await tx.payoutBatch.update({ where: { id: batchId }, data: { status: "PARTIALLY_FAILED" } });
}

/**
 * Checker confirms the transfer against the bank statement (≠ recorder). Only now is the
 * withdrawal PAID and the PAYOUT journal posted. Exactly-once via conditional update.
 */
export async function confirmPayoutTransfer(actor: Actor, attemptId: string) {
  requirePermission(actor, "payout.confirm");
  return withTx(async (tx) => {
    const a = await tx.payoutAttempt.findUnique({ where: { id: attemptId }, include: { withdrawal: { include: { agent: true, bankAccount: true } } } });
    if (!a) throw notFound("Percobaan pembayaran");
    requireDifferentUser(a.recordedById, actor, "Konfirmasi pembayaran");
    const upd = await tx.payoutAttempt.updateMany({ where: { id: a.id, status: "SUBMITTED" }, data: { status: "CONFIRMED", confirmedById: actor.userId, confirmedAt: new Date() } });
    if (upd.count !== 1) throw rule("Pembayaran tidak menunggu konfirmasi.");
    const w = a.withdrawal;
    const wUpd = await tx.withdrawalRequest.updateMany({ where: { id: w.id, status: "PROCESSING" }, data: { status: "PAID", paidAt: new Date() } });
    if (wUpd.count !== 1) throw conflict("Penarikan sudah dibayar atau tidak dalam proses.");
    await postJournal(tx, {
      journalRef: `PAYOUT:${w.id}`, kind: "PAYOUT", agentId: w.agentId, createdById: actor.userId, description: `Pembayaran WD-${w.withdrawalNumber} ref ${a.providerReference}`,
      lines: [dr("AGENT_RESERVED", w.amount, { agentId: w.agentId, withdrawalId: w.id }), cr("PAYOUT_CLEARING", w.amount, { withdrawalId: w.id })],
    });
    await tx.wallet.update({ where: { agentId: w.agentId }, data: { paidTotal: { increment: w.amount } } });
    await refreshPaidStatuses(tx, w.agentId);
    await refreshBatchStatus(tx, a.batchId);
    await audit(tx, actor, { action: "payout.confirm", entityType: "PayoutAttempt", entityId: a.id, after: { withdrawalId: w.id, amount: w.amount } });
    await notifyUser(tx, w.agent.userId, "payout.confirmed", { amount: formatRupiah(w.amount), bank: `${w.bankAccount.bankName} ****${w.bankAccount.accountNumberLast4}`, reference: a.providerReference ?? "" }, "/agent/wallet");
  });
}

export async function failPayoutAttempt(actor: Actor, attemptId: string, reason: string) {
  requirePermission(actor, "payout.record");
  if (reason.trim().length < 5) throw invalid("Alasan kegagalan wajib diisi.");
  return withTx(async (tx) => {
    const a = await tx.payoutAttempt.findUnique({ where: { id: attemptId }, include: { withdrawal: { include: { agent: true } } } });
    if (!a) throw notFound("Percobaan pembayaran");
    const upd = await tx.payoutAttempt.updateMany({ where: { id: a.id, status: { in: ["PENDING", "SUBMITTED"] } }, data: { status: "FAILED", failureReason: reason } });
    if (upd.count !== 1) throw rule("Percobaan pembayaran tidak dapat ditandai gagal.");
    await tx.withdrawalRequest.update({ where: { id: a.withdrawalId }, data: { status: "FAILED", failureReason: reason } });
    await refreshBatchStatus(tx, a.batchId);
    await audit(tx, actor, { action: "payout.fail", entityType: "PayoutAttempt", entityId: a.id, after: { reason } });
    await notifyUser(tx, a.withdrawal.agent.userId, "payout.failed", { amount: formatRupiah(a.amount), reason }, "/agent/wallet");
  });
}

/** Retry a failed payout with a new attempt (one live attempt per withdrawal — DB enforced). */
export async function retryPayout(actor: Actor, withdrawalId: string) {
  requirePermission(actor, "payout.record");
  try {
    return await withTx(async (tx) => {
      const w = await tx.withdrawalRequest.findUnique({ where: { id: withdrawalId }, include: { attempts: { orderBy: { attemptNumber: "desc" }, take: 1 }, bankAccount: true } });
      if (!w || !w.batchId) throw notFound("Penarikan");
      if (w.status !== "FAILED") throw rule("Hanya penarikan gagal yang dapat dicoba ulang.");
      if (w.bankAccount.status !== "VERIFIED") throw rule("Rekening tujuan tidak terverifikasi.");
      const n = (w.attempts[0]?.attemptNumber ?? 0) + 1;
      await tx.payoutAttempt.create({ data: { withdrawalId: w.id, batchId: w.batchId, attemptNumber: n, provider: "MANUAL_BANK_TRANSFER", amount: w.amount } });
      await tx.withdrawalRequest.update({ where: { id: w.id }, data: { status: "PROCESSING", failureReason: null } });
      await tx.payoutBatch.update({ where: { id: w.batchId }, data: { status: "PROCESSING", completedAt: null } });
      await audit(tx, actor, { action: "payout.retry", entityType: "WithdrawalRequest", entityId: w.id, after: { attemptNumber: n } });
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw conflict("Sudah ada percobaan pembayaran yang berjalan.");
    throw e;
  }
}

/** Give up on a failed payout: funds return to the agent's payable balance. */
export async function returnFailedWithdrawal(actor: Actor, withdrawalId: string, reason: string) {
  requirePermission(actor, "payout.record");
  return withTx(async (tx) => {
    const w = await tx.withdrawalRequest.findUnique({ where: { id: withdrawalId } });
    if (!w) throw notFound("Penarikan");
    const upd = await tx.withdrawalRequest.updateMany({ where: { id: w.id, status: "FAILED" }, data: { status: "CANCELLED", failureReason: reason } });
    if (upd.count !== 1) throw rule("Hanya penarikan gagal yang dapat dikembalikan.");
    await releaseReserved(tx, w, actor, reason);
    if (w.batchId) await refreshBatchStatus(tx, w.batchId);
    await audit(tx, actor, { action: "withdrawal.return_funds", entityType: "WithdrawalRequest", entityId: w.id, after: { reason } });
  });
}

/** Agent statement rows (ledger entries on the agent's accounts) for a period. */
export async function agentStatement(actor: Actor, agentId: string, from: Date, to: Date) {
  if (actor.agentId !== agentId) requirePermission(actor, "commission.view");
  return prisma.commissionLedgerEntry.findMany({
    where: { agentId, createdAt: { gte: from, lt: to } },
    include: { journal: true },
    orderBy: { createdAt: "asc" },
  });
}
