import "server-only";
import { z } from "zod";
import type { Prisma, TxnStatus } from "@prisma/client";
import { prisma, withTx, isUniqueViolation, type Db, type Tx } from "../db";
import { audit } from "../audit";
import { evaluateTransactionReward, reverseCommissionEvent } from "./commissions";
import { requirePermission, SYSTEM_ACTOR, type Actor } from "../rbac";
import { AppError, invalid, notFound, rule } from "../errors";
import { businessDate, parseDateOnly } from "@/lib/time";
import { toRupiah } from "@/lib/money";
import { getSetting } from "../settings";

// ─────────────────────────────── Normalization (pure) ───────────────────────────────

const STATUS_MAP: Record<string, TxnStatus> = {
  SUCCESS: "SUCCESS", SUCCEEDED: "SUCCESS", APPROVED: "SUCCESS", SETTLED: "SUCCESS", PAID: "SUCCESS", "00": "SUCCESS",
  FAILED: "FAILED", FAIL: "FAILED", DECLINED: "FAILED", REJECTED: "FAILED", ERROR: "FAILED",
  PENDING: "PENDING", PROCESSING: "PENDING",
  REVERSED: "REVERSED", REVERSAL: "REVERSED", VOIDED: "REVERSED", REFUNDED: "REVERSED", CANCELLED: "REVERSED",
};

/** Parse a timestamp. Values without an explicit offset are interpreted as Asia/Jakarta local time. */
export function parseTimestamp(v: string): Date | null {
  const s = v.trim();
  if (!s) return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/);
  if (m) {
    const [, y, mo, d, h, mi, se = "00", frac = "", tz] = m;
    const iso = `${y}-${mo}-${d}T${h}:${mi}:${se}${frac}${tz ? (tz === "Z" ? "Z" : tz.length === 5 ? `${tz.slice(0, 3)}:${tz.slice(3)}` : tz) : "+07:00"}`;
    const dt = new Date(iso);
    return Number.isNaN(dt.getTime()) ? null : dt;
  }
  const dmy = s.match(/^(\d{2})\/(\d{2})\/(\d{4})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (dmy) {
    const [, d, mo, y, h, mi, se = "00"] = dmy;
    const dt = new Date(`${y}-${mo}-${d}T${h}:${mi}:${se}+07:00`);
    return Number.isNaN(dt.getTime()) ? null : dt;
  }
  return null;
}

export interface NormalizedTransaction {
  externalId: string;
  terminalId: string;
  processorMid: string | null;
  type: string;
  status: TxnStatus;
  amount: bigint;
  occurredAt: Date;
  settlementRef: string | null;
  isTest: boolean;
}

export const rawTransactionSchema = z.object({
  externalId: z.union([z.string(), z.number()]).transform(String),
  terminalId: z.union([z.string(), z.number()]).transform(String),
  processorMid: z.union([z.string(), z.number()]).transform(String).optional().nullable(),
  type: z.string().optional().nullable(),
  status: z.string(),
  amount: z.union([z.string(), z.number()]),
  occurredAt: z.string(),
  settlementRef: z.union([z.string(), z.number()]).transform(String).optional().nullable(),
  isTest: z.union([z.boolean(), z.string()]).optional().nullable(),
});
export type RawTransaction = z.input<typeof rawTransactionSchema>;

export function normalizeTransaction(raw: unknown): { ok: true; value: NormalizedTransaction } | { ok: false; errors: string[] } {
  const parsed = rawTransactionSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, errors: parsed.error.issues.map((i) => `${i.path.join(".") || "row"}: ${i.message}`) };
  const r = parsed.data;
  const errors: string[] = [];
  const externalId = r.externalId.trim();
  if (!/^[\w.:-]{1,100}$/.test(externalId)) errors.push("externalId tidak valid");
  const terminalId = r.terminalId.trim().toUpperCase();
  if (!/^[A-Z0-9-]{4,32}$/.test(terminalId)) errors.push("terminalId tidak valid");
  const status = STATUS_MAP[r.status.trim().toUpperCase()];
  if (!status) errors.push(`status tidak dikenal: ${r.status}`);
  let amount = 0n;
  try {
    const raw = typeof r.amount === "number" ? r.amount : r.amount.replace(/,00$/, "");
    if (typeof raw === "number" && !Number.isInteger(raw)) throw new Error();
    amount = toRupiah(raw);
    if (amount < 0n) errors.push("amount negatif");
  } catch {
    errors.push("amount harus bilangan bulat Rupiah");
  }
  const occurredAt = parseTimestamp(r.occurredAt);
  if (!occurredAt) errors.push("occurredAt tidak valid (gunakan ISO 8601 atau YYYY-MM-DD HH:mm:ss WIB)");
  else if (occurredAt.getTime() > Date.now() + 10 * 60_000) errors.push("occurredAt di masa depan");
  const isTest = typeof r.isTest === "boolean" ? r.isTest : ["true", "1", "yes", "y"].includes(String(r.isTest ?? "").trim().toLowerCase());
  const type = (r.type ?? "PURCHASE").trim().toUpperCase() || "PURCHASE";
  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      externalId, terminalId, processorMid: r.processorMid?.trim() || null, type: isTest ? type : type, status: status!, amount,
      occurredAt: occurredAt!, settlementRef: r.settlementRef?.trim() || null, isTest: isTest || type === "TEST",
    },
  };
}

// ─────────────────────────────── Ingestion ───────────────────────────────

export type IngestResult = { externalId: string; result: "CREATED" | "UPDATED" | "DUPLICATE" | "CONFLICT" | "REJECTED"; transactionId?: string; errors?: string[] };

async function openException(tx: Db, data: { type: Prisma.ReconciliationExceptionCreateInput["type"]; transactionId?: string; settlementId?: string; details: Record<string, unknown>; runId?: string }) {
  await tx.reconciliationException.createMany({ data: [{ ...data, details: data.details as Prisma.InputJsonValue }], skipDuplicates: true });
}

async function matchTerminal(tx: Tx, terminalId: string) {
  const device = await tx.device.findUnique({ where: { terminalId } });
  if (!device || !device.merchantId) return null;
  return device;
}

async function linkSettlement(tx: Tx, source: string, settlementRef: string | null) {
  if (!settlementRef) return null;
  return tx.settlement.findUnique({ where: { source_settlementRef: { source, settlementRef } } });
}

async function ingestOne(source: string, channel: string, n: NormalizedTransaction, actor: Actor, importId?: string, rawPayload?: unknown): Promise<IngestResult> {
  const idempotencyKey = `${source}:${n.externalId}`;
  try {
    return await withTx(async (tx) => {
      const existingRows = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "Transaction" WHERE "idempotencyKey" = ${idempotencyKey} FOR UPDATE`;
      const existing = existingRows[0] ? await tx.transaction.findUnique({ where: { id: existingRows[0].id } }) : null;
      if (!existing) {
        const device = await matchTerminal(tx, n.terminalId);
        const settlement = await linkSettlement(tx, source, n.settlementRef);
        const t = await tx.transaction.create({
          data: {
            source, externalId: n.externalId, idempotencyKey, terminalId: n.terminalId, processorMid: n.processorMid, type: n.type, status: n.status,
            amount: n.amount, occurredAt: n.occurredAt, businessDate: businessDate(n.occurredAt), settlementRef: n.settlementRef,
            settlementId: settlement && ["RECONCILED", "ACCEPTED_WITH_EXCEPTION"].includes(settlement.status) ? settlement.id : null,
            settledAt: settlement && ["RECONCILED", "ACCEPTED_WITH_EXCEPTION"].includes(settlement.status) ? settlement.reconciledAt : null,
            isTest: n.isTest, matchStatus: device ? "MATCHED" : "UNMATCHED", merchantId: device?.merchantId ?? null, deviceId: device?.id ?? null,
            importId, ingestChannel: channel, rawPayload: (rawPayload ?? undefined) as Prisma.InputJsonValue | undefined,
          },
        });
        if (!device && n.status === "SUCCESS" && !n.isTest) {
          await openException(tx, { type: "UNMATCHED_TERMINAL", transactionId: t.id, details: { terminalId: n.terminalId, source, externalId: n.externalId } });
        }
        if (device) await evaluateTransactionReward(tx, t.id, actor);
        return { externalId: n.externalId, result: "CREATED" as const, transactionId: t.id };
      }

      // Existing transaction — idempotent replay or a legitimate status update.
      if (existing.amount !== n.amount || existing.terminalId !== n.terminalId) {
        await openException(tx, { type: "STATUS_CONFLICT", transactionId: existing.id, details: { reason: "amount/terminal differs on replay", stored: { amount: existing.amount.toString(), terminalId: existing.terminalId }, received: { amount: n.amount.toString(), terminalId: n.terminalId } } });
        return { externalId: n.externalId, result: "CONFLICT" as const, transactionId: existing.id };
      }
      const data: Prisma.TransactionUpdateInput = {};
      if (!existing.settlementRef && n.settlementRef) data.settlementRef = n.settlementRef;
      if (existing.status !== n.status) {
        const allowed = (existing.status === "PENDING" && n.status !== "PENDING") || (existing.status === "SUCCESS" && n.status === "REVERSED");
        if (!allowed) {
          await openException(tx, { type: "STATUS_CONFLICT", transactionId: existing.id, details: { from: existing.status, to: n.status } });
          return { externalId: n.externalId, result: "CONFLICT" as const, transactionId: existing.id };
        }
        data.status = n.status;
      }
      if (Object.keys(data).length === 0) return { externalId: n.externalId, result: "DUPLICATE" as const, transactionId: existing.id };
      await tx.transaction.update({ where: { id: existing.id }, data });
      if (data.status === "REVERSED") {
        const ev = await tx.commissionEvent.findUnique({ where: { eventRef: `TXN:${existing.id}` } });
        if (ev) await reverseCommissionEvent(tx, ev.id, `Transaksi ${n.externalId} dibatalkan oleh prosesor`, actor);
        else await tx.transaction.update({ where: { id: existing.id }, data: { rewardStatus: "INELIGIBLE", ineligibleReason: "STATUS_REVERSED" } });
      } else if (existing.matchStatus === "MATCHED") {
        await evaluateTransactionReward(tx, existing.id, actor);
      }
      return { externalId: n.externalId, result: "UPDATED" as const, transactionId: existing.id };
    });
  } catch (e) {
    // Concurrent first insert of the same key: the other writer won; treat as duplicate replay.
    if (isUniqueViolation(e)) return { externalId: n.externalId, result: "DUPLICATE" };
    throw e;
  }
}

export async function ingestTransactions(actor: Actor, source: string, items: unknown[], channel: "API" | "WEBHOOK" | "IMPORT" | "SEED_DEMO", opts: { importId?: string } = {}): Promise<IngestResult[]> {
  if (actor.kind === "api") {
    if (actor.apiSource !== source) throw new AppError("FORBIDDEN", "API key tidak berhak menulis sumber ini.");
  } else requirePermission(actor, channel === "IMPORT" ? "import.manage" : "transaction.ingest");
  if (!Array.isArray(items)) throw invalid("Daftar transaksi harus berupa array.");
  if (!/^[A-Z0-9_]{2,40}$/.test(source)) throw invalid("Kode sumber tidak valid.");
  if (items.length > 5000) throw invalid("Maksimal 5000 transaksi per permintaan.");
  const out: IngestResult[] = [];
  for (const raw of items) {
    const n = normalizeTransaction(raw);
    if (!n.ok) {
      out.push({ externalId: String((raw as Record<string, unknown>)?.externalId ?? "?"), result: "REJECTED", errors: n.errors });
      continue;
    }
    out.push(await ingestOne(source, channel, n.value, actor, opts.importId, channel === "IMPORT" ? undefined : raw));
  }
  return out;
}

// ─────────────────────────────── Settlements ───────────────────────────────

export const settlementSchema = z.object({
  settlementRef: z.union([z.string(), z.number()]).transform((v) => String(v).trim()).pipe(z.string().min(1).max(100)),
  settlementDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  expectedCount: z.coerce.number().int().min(0),
  expectedAmount: z.union([z.string(), z.number()]).transform((v) => toRupiah(v)),
});

export async function ingestSettlements(actor: Actor, source: string, items: unknown[], opts: { importId?: string } = {}) {
  if (actor.kind === "api") {
    if (actor.apiSource !== source) throw new AppError("FORBIDDEN", "API key tidak berhak menulis sumber ini.");
  } else requirePermission(actor, opts.importId ? "import.manage" : "transaction.ingest");
  if (!Array.isArray(items)) throw invalid("Daftar settlement harus berupa array.");
  const out: { settlementRef: string; result: "CREATED" | "DUPLICATE" | "CONFLICT" | "REJECTED"; errors?: string[] }[] = [];
  for (const raw of items) {
    const p = settlementSchema.safeParse(raw);
    if (!p.success) {
      out.push({ settlementRef: String((raw as Record<string, unknown>)?.settlementRef ?? "?"), result: "REJECTED", errors: p.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) });
      continue;
    }
    const s = p.data;
    const existing = await prisma.settlement.findUnique({ where: { source_settlementRef: { source, settlementRef: s.settlementRef } } });
    if (existing) {
      const same = existing.expectedCount === s.expectedCount && existing.expectedAmount === s.expectedAmount;
      out.push({ settlementRef: s.settlementRef, result: same ? "DUPLICATE" : "CONFLICT" });
      if (!same) {
        await openException(prisma, { type: "SETTLEMENT_MISMATCH", settlementId: existing.id, details: { reason: "settlement report replay with different totals", received: { count: s.expectedCount, amount: s.expectedAmount.toString() } } });
      }
      continue;
    }
    try {
      await prisma.settlement.create({ data: { source, settlementRef: s.settlementRef, settlementDate: parseDateOnly(s.settlementDate), expectedCount: s.expectedCount, expectedAmount: s.expectedAmount, importId: opts.importId } });
      out.push({ settlementRef: s.settlementRef, result: "CREATED" });
    } catch (e) {
      if (isUniqueViolation(e)) out.push({ settlementRef: s.settlementRef, result: "DUPLICATE" });
      else throw e;
    }
  }
  return out;
}

// ─────────────────────────────── Matching & reconciliation ───────────────────────────────

/** Re-match unmatched transactions for a terminal (after activation) and evaluate rewards. */
export async function rematchTerminal(terminalId: string, actor: Actor = SYSTEM_ACTOR) {
  const unmatched = await prisma.transaction.findMany({ where: { terminalId, matchStatus: "UNMATCHED" }, select: { id: true } });
  let matched = 0;
  for (const { id } of unmatched) {
    await withTx(async (tx) => {
      const device = await matchTerminal(tx, terminalId);
      if (!device) return;
      await tx.transaction.update({ where: { id }, data: { matchStatus: "MATCHED", merchantId: device.merchantId, deviceId: device.id } });
      await tx.reconciliationException.updateMany({ where: { transactionId: id, type: "UNMATCHED_TERMINAL", status: "OPEN" }, data: { status: "RESOLVED", resolution: "Auto-matched after device activation", resolvedAt: new Date() } });
      await evaluateTransactionReward(tx, id, actor);
      matched++;
    });
  }
  return { matched, total: unmatched.length };
}

async function reconcileSettlement(settlementId: string, runId: string, actor: Actor, accept = false) {
  return withTx(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Settlement" WHERE "id" = ${settlementId} FOR UPDATE`;
    const s = await tx.settlement.findUniqueOrThrow({ where: { id: settlementId } });
    if (s.status === "RECONCILED" || s.status === "ACCEPTED_WITH_EXCEPTION") return s.status;
    const agg = await tx.transaction.aggregate({ where: { source: s.source, settlementRef: s.settlementRef, status: "SUCCESS" }, _count: true, _sum: { amount: true } });
    const count = agg._count;
    const amount = agg._sum.amount ?? 0n;
    const matches = count === s.expectedCount && amount === s.expectedAmount;
    const now = new Date();
    if (matches || accept) {
      const status = matches ? "RECONCILED" : "ACCEPTED_WITH_EXCEPTION";
      await tx.settlement.update({ where: { id: s.id }, data: { status, matchedCount: count, matchedAmount: amount, reconciledAt: now } });
      await tx.transaction.updateMany({ where: { source: s.source, settlementRef: s.settlementRef, status: "SUCCESS" }, data: { settlementId: s.id, settledAt: now } });
      await tx.reconciliationException.updateMany({ where: { settlementId: s.id, status: "OPEN" }, data: { status: "RESOLVED", resolvedAt: now, resolvedById: actor.userId, resolution: matches ? "Totals matched on re-run" : "Accepted with exception" } });
      return status;
    }
    await tx.settlement.update({ where: { id: s.id }, data: { status: "MISMATCH", matchedCount: count, matchedAmount: amount } });
    await openException(tx, { type: "SETTLEMENT_MISMATCH", settlementId: s.id, runId, details: { expected: { count: s.expectedCount, amount: s.expectedAmount.toString() }, actual: { count, amount: amount.toString() } } });
    return "MISMATCH";
  });
}

/**
 * Daily reconciliation for a Jakarta business date: reconcile settlement reports, flag missing
 * settlements and unmatched terminals, then evaluate rewards for settled transactions.
 */
export async function runReconciliation(actor: Actor, dateStr: string) {
  if (actor.kind !== "system") requirePermission(actor, "reconciliation.manage");
  const date = parseDateOnly(dateStr);
  const run = await prisma.reconciliationRun.create({ data: { businessDate: date, triggeredBy: actor.userId ?? "scheduler" } });
  try {
    const stats = { settlementsReconciled: 0, settlementsMismatch: 0, missingSettlement: 0, unmatched: 0, rewarded: 0, awaitingSettlement: 0, ineligible: 0 };
    const settlements = await prisma.settlement.findMany({ where: { settlementDate: { lte: date }, status: { in: ["RECEIVED", "MISMATCH"] } }, select: { id: true } });
    for (const s of settlements) {
      const r = await reconcileSettlement(s.id, run.id, actor);
      if (r === "RECONCILED") stats.settlementsReconciled++;
      else if (r === "MISMATCH") stats.settlementsMismatch++;
    }

    if (await getSetting("reconciliation.requireSettlementReport")) {
      const missing = await prisma.transaction.findMany({
        where: { businessDate: { lt: date }, status: "SUCCESS", settlementId: null, isTest: false },
        select: { id: true, settlementRef: true, source: true, externalId: true }, take: 5000,
      });
      for (const t of missing) {
        const hasReport = t.settlementRef ? await prisma.settlement.findUnique({ where: { source_settlementRef: { source: t.source, settlementRef: t.settlementRef } } }) : null;
        if (!hasReport) {
          await openException(prisma, { type: "MISSING_SETTLEMENT", transactionId: t.id, runId: run.id, details: { settlementRef: t.settlementRef, externalId: t.externalId } });
          stats.missingSettlement++;
        }
      }
    }

    // Try to match any unmatched terminals (devices may have been activated since).
    const terminals = await prisma.transaction.findMany({ where: { matchStatus: "UNMATCHED", businessDate: { lte: date } }, distinct: ["terminalId"], select: { terminalId: true } });
    for (const { terminalId } of terminals) await rematchTerminal(terminalId, actor);
    stats.unmatched = await prisma.transaction.count({ where: { matchStatus: "UNMATCHED", businessDate: { lte: date } } });

    const toEvaluate = await prisma.transaction.findMany({ where: { businessDate: { lte: date }, matchStatus: "MATCHED", rewardStatus: { in: ["NOT_EVALUATED", "AWAITING_SETTLEMENT"] } }, select: { id: true }, take: 50_000 });
    for (const { id } of toEvaluate) {
      const r = await withTx((tx) => evaluateTransactionReward(tx, id, actor));
      if (r.outcome === "REWARDED") stats.rewarded++;
      else if (r.outcome === "AWAITING_SETTLEMENT") stats.awaitingSettlement++;
      else if (r.outcome === "INELIGIBLE") stats.ineligible++;
    }
    await prisma.reconciliationRun.update({ where: { id: run.id }, data: { status: "COMPLETED", stats, finishedAt: new Date() } });
    await audit(prisma, actor, { action: "reconciliation.run", entityType: "ReconciliationRun", entityId: run.id, after: stats, metadata: { date: dateStr } });
    return { runId: run.id, stats };
  } catch (e) {
    await prisma.reconciliationRun.update({ where: { id: run.id }, data: { status: "FAILED", error: (e as Error).message.slice(0, 1000), finishedAt: new Date() } });
    throw e;
  }
}

export async function resolveException(actor: Actor, exceptionId: string, action: "ignore" | "accept_settlement" | "retry", note: string) {
  requirePermission(actor, "reconciliation.manage");
  const ex = await prisma.reconciliationException.findUnique({ where: { id: exceptionId } });
  if (!ex) throw notFound("Pengecualian");
  if (ex.status !== "OPEN") throw rule("Pengecualian sudah ditutup.");
  if (note.trim().length < 5) throw invalid("Catatan wajib diisi.");
  if (action === "accept_settlement") {
    if (ex.type !== "SETTLEMENT_MISMATCH" || !ex.settlementId) throw rule("Hanya untuk selisih settlement.");
    const run = await prisma.reconciliationRun.create({ data: { businessDate: new Date(), triggeredBy: actor.userId ?? "system" } });
    await reconcileSettlement(ex.settlementId, run.id, actor, true);
    await prisma.reconciliationRun.update({ where: { id: run.id }, data: { status: "COMPLETED", finishedAt: new Date(), stats: { acceptedSettlement: ex.settlementId } } });
  } else if (action === "retry") {
    if (ex.transactionId) {
      const t = await prisma.transaction.findUniqueOrThrow({ where: { id: ex.transactionId } });
      await rematchTerminal(t.terminalId, actor);
    }
  }
  await prisma.$transaction(async (tx) => {
    const fresh = await tx.reconciliationException.findUniqueOrThrow({ where: { id: ex.id } });
    if (fresh.status === "OPEN" && action !== "retry") {
      await tx.reconciliationException.update({ where: { id: ex.id }, data: { status: action === "ignore" ? "IGNORED" : "RESOLVED", resolution: note, resolvedById: actor.userId, resolvedAt: new Date() } });
    }
    await audit(tx, actor, { action: `reconciliation.exception.${action}`, entityType: "ReconciliationException", entityId: ex.id, after: { note } });
  });
}

/** Merchant-scoped transaction history (agent sees only attributed merchants; merchant only own). */
export async function transactionsForMerchant(actor: Actor, merchantId: string, take = 200) {
  const m = await prisma.merchant.findUnique({ where: { id: merchantId }, include: { attributions: true } });
  if (!m) throw notFound("Merchant");
  const { assertMerchantAccess } = await import("./merchants");
  assertMerchantAccess(actor, m);
  return prisma.transaction.findMany({ where: { merchantId }, orderBy: { occurredAt: "desc" }, take });
}
