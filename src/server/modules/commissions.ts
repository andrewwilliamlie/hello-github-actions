import "server-only";
import type { CommissionEvent, CommissionRule, CommissionType, Prisma } from "@prisma/client";
import { prisma, withTx, type Db, type Tx } from "../db";
import { cr, dr, lockWallet, postJournal } from "../ledger";
import {
  calculateReferralShare, calculateSalesCommission, calculateTransactionReward, referralTypeFor, selectRule, snapshotRule,
  type EngineRule, type RuleConditions,
} from "../commission/engine";
import { addDays, businessDate } from "@/lib/time";
import { formatRupiah, minRupiah } from "@/lib/money";
import { getSetting } from "../settings";
import { audit } from "../audit";
import { notifyUser } from "../notifications/notify";
import { blockingFlagCount } from "./fraud";
import { requirePermission, SYSTEM_ACTOR, type Actor } from "../rbac";
import { AppError, forbidden, notFound, rule as ruleError } from "../errors";

export function toEngineRule(r: CommissionRule): EngineRule {
  return {
    id: r.id, code: r.code, version: r.version, type: r.type, status: r.status, name: r.name, productId: r.productId,
    fixedAmount: r.fixedAmount, rateBps: r.rateBps, capAmount: r.capAmount, conditions: (r.conditions ?? {}) as RuleConditions,
    priority: r.priority, effectiveFrom: r.effectiveFrom, effectiveTo: r.effectiveTo, holdDays: r.holdDays,
    requiresManualApproval: r.requiresManualApproval, deductFromRecruit: r.deductFromRecruit, isDemo: r.isDemo,
  };
}

export async function activeRules(db: Db, type: CommissionType): Promise<EngineRule[]> {
  const rows = await db.commissionRule.findMany({ where: { type, status: "ACTIVE" } });
  return rows.map(toEngineRule);
}

const net = (e: Pick<CommissionEvent, "amount" | "deductedAmount">) => e.amount - e.deductedAmount;

async function lockEvent(tx: Tx, id: string): Promise<CommissionEvent | null> {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "CommissionEvent" WHERE "id" = ${id} FOR UPDATE`;
  if (!rows[0]) return null;
  return tx.commissionEvent.findUnique({ where: { id } });
}

const SOURCE_LABEL: Record<CommissionType, string> = {
  SALES: "penjualan perangkat", TRANSACTION_REWARD: "transaksi merchant", REFERRAL_SALES: "referral (penjualan)",
  REFERRAL_TRANSACTION: "referral (transaksi)", ADJUSTMENT: "penyesuaian",
};

async function createEventWithAccrual(
  tx: Tx,
  data: Omit<Prisma.CommissionEventUncheckedCreateInput, "status"> & { status?: CommissionEvent["status"] },
  actor: Actor,
): Promise<CommissionEvent> {
  const event = await tx.commissionEvent.create({ data: { status: "PENDING", ...data } });
  await postJournal(tx, {
    journalRef: `ACCRUAL:${event.id}`, kind: "ACCRUAL", agentId: event.agentId, createdById: actor.userId,
    description: `Akrual ${SOURCE_LABEL[event.type]} ${event.eventRef}`,
    lines: [dr("COMMISSION_EXPENSE", event.amount, { commissionEventId: event.id }), cr("AGENT_PENDING", event.amount, { agentId: event.agentId, commissionEventId: event.id })],
  });
  return event;
}

// ─────────────────────────────── Sales commission ───────────────────────────────

/**
 * Accrue the single sales commission for an activated order. Requires verified payment, approved
 * merchant and device activation. Idempotent by eventRef SALE:{orderId}.
 */
export async function accrueSalesCommission(tx: Tx, orderId: string, actor: Actor): Promise<CommissionEvent | null> {
  const eventRef = `SALE:${orderId}`;
  const existing = await tx.commissionEvent.findUnique({ where: { eventRef } });
  if (existing) return existing;

  const order = await tx.salesOrder.findUnique({ where: { id: orderId }, include: { product: true, merchant: true, payments: true, activation: true } });
  if (!order) throw notFound("Pesanan");
  if (order.status !== "ACTIVATED" || !order.activation) throw ruleError("Komisi penjualan memerlukan aktivasi perangkat.");
  const verified = order.payments.filter((p) => p.status === "VERIFIED").reduce((s, p) => s + p.amount, 0n);
  if (verified < order.totalAmount) throw ruleError("Komisi penjualan memerlukan pembayaran terverifikasi penuh.");
  if (["SUSPENDED", "REFUNDED", "CANCELLED"].includes(order.merchant.status)) throw ruleError("Merchant tidak dalam status yang memenuhi syarat.");

  const basis = await getSetting("sales.ruleDateBasis", tx);
  const at = basis === "ACTIVATION_DATE" ? order.activation.activatedAt : order.createdAt;
  const rule = selectRule(await activeRules(tx, "SALES"), { type: "SALES", at, productId: order.productId, merchantId: order.merchantId });
  if (!rule) {
    await audit(tx, actor, { action: "commission.no_rule", entityType: "SalesOrder", entityId: order.id, metadata: { productId: order.productId, at: at.toISOString() } });
    return null;
  }
  const calc = calculateSalesCommission(rule, { orderRef: `ORD-${order.orderNumber}`, productSku: order.product.sku, quantity: order.quantity });
  const occurredAt = order.activation.activatedAt;
  const event = await createEventWithAccrual(tx, {
    eventRef, type: "SALES", agentId: order.sellingAgentId, amount: calc.amount, ruleId: rule.id, ruleCode: rule.code, ruleVersion: rule.version,
    ruleSnapshot: snapshotRule(rule) as never, calculation: calc.calculation as never, sourceOrderId: order.id, merchantId: order.merchantId,
    productId: order.productId, occurredAt, businessDate: businessDate(occurredAt), holdUntil: addDays(occurredAt, rule.holdDays), isDemo: rule.isDemo,
  }, actor);
  await audit(tx, actor, { action: "commission.accrued", entityType: "CommissionEvent", entityId: event.id, after: { eventRef, amount: event.amount, rule: `${rule.code} v${rule.version}` } });
  const agent = await tx.agent.findUniqueOrThrow({ where: { id: order.sellingAgentId } });
  await notifyUser(tx, agent.userId, "commission.credited", { amount: formatRupiah(event.amount), source: `${order.product.name} — ${order.merchant.businessName}` }, "/agent/earnings");
  return event;
}

// ─────────────────────────────── Transaction reward ───────────────────────────────

export type RewardOutcome = "REWARDED" | "ALREADY" | "AWAITING_SETTLEMENT" | "INELIGIBLE" | "UNMATCHED";

/** Evaluate one transaction for the recurring reward. Locks the transaction row. Idempotent. */
export async function evaluateTransactionReward(tx: Tx, transactionId: string, actor: Actor = SYSTEM_ACTOR): Promise<{ outcome: RewardOutcome; reason?: string }> {
  await tx.$queryRaw`SELECT "id" FROM "Transaction" WHERE "id" = ${transactionId} FOR UPDATE`;
  const t = await tx.transaction.findUnique({ where: { id: transactionId }, include: { settlement: true } });
  if (!t) throw notFound("Transaksi");
  if (t.rewardStatus === "REWARDED" || t.rewardStatus === "REVERSED") return { outcome: "ALREADY" };

  const ineligible = async (reason: string) => {
    await tx.transaction.update({ where: { id: t.id }, data: { rewardStatus: "INELIGIBLE", ineligibleReason: reason } });
    return { outcome: "INELIGIBLE" as const, reason };
  };
  if (t.status !== "SUCCESS") return ineligible(`STATUS_${t.status}`);
  if (t.isTest) return ineligible("TEST_TRANSACTION");
  const excluded = await getSetting("transaction.excludedTypes", tx);
  if (excluded.includes(t.type.toUpperCase())) return ineligible(`EXCLUDED_TYPE_${t.type}`);
  if (t.matchStatus !== "MATCHED" || !t.merchantId || !t.deviceId) return { outcome: "UNMATCHED" };

  const requireReport = await getSetting("reconciliation.requireSettlementReport", tx);
  const settled = requireReport
    ? !!t.settlement && ["RECONCILED", "ACCEPTED_WITH_EXCEPTION"].includes(t.settlement.status) && !!t.settledAt
    : !!t.settlementRef;
  if (!settled) {
    await tx.transaction.update({ where: { id: t.id }, data: { rewardStatus: "AWAITING_SETTLEMENT", ineligibleReason: null } });
    return { outcome: "AWAITING_SETTLEMENT" };
  }

  const activation = await tx.activation.findFirst({
    where: { deviceId: t.deviceId, merchantId: t.merchantId, activatedAt: { lte: t.occurredAt }, OR: [{ deactivatedAt: null }, { deactivatedAt: { gt: t.occurredAt } }] },
  });
  if (!activation) return ineligible("DEVICE_NOT_ACTIVE_AT_TIME");
  const attribution = await tx.merchantAttribution.findFirst({
    where: { merchantId: t.merchantId, effectiveFrom: { lte: t.occurredAt }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: t.occurredAt } }] },
  });
  if (!attribution) return ineligible("NO_ATTRIBUTION");

  const rule = selectRule(await activeRules(tx, "TRANSACTION_REWARD"), {
    type: "TRANSACTION_REWARD", at: t.occurredAt, transactionType: t.type, source: t.source, merchantId: t.merchantId, amount: t.amount,
  });
  if (!rule) return ineligible("NO_ACTIVE_RULE");

  const calc = calculateTransactionReward(rule, { transactionRef: `${t.source}:${t.externalId}`, transactionType: t.type, transactionAmount: t.amount });
  await createEventWithAccrual(tx, {
    eventRef: `TXN:${t.id}`, type: "TRANSACTION_REWARD", agentId: attribution.agentId, amount: calc.amount, ruleId: rule.id, ruleCode: rule.code,
    ruleVersion: rule.version, ruleSnapshot: snapshotRule(rule) as never, calculation: calc.calculation as never, sourceTransactionId: t.id,
    merchantId: t.merchantId, occurredAt: t.occurredAt, businessDate: t.businessDate, holdUntil: addDays(t.settledAt ?? t.occurredAt, rule.holdDays),
    isDemo: rule.isDemo || t.ingestChannel === "SEED_DEMO",
  }, actor);
  await tx.transaction.update({ where: { id: t.id }, data: { rewardStatus: "REWARDED", ineligibleReason: null } });
  return { outcome: "REWARDED" };
}

// ─────────────────────────────── Referral share ───────────────────────────────

/** Create the direct referrer's share when a recruit's base event becomes ELIGIBLE. One level only. */
export async function createReferralShare(tx: Tx, base: CommissionEvent, actor: Actor): Promise<CommissionEvent | null> {
  const refType = referralTypeFor(base.type);
  if (!refType) return null;
  const eventRef = `REF:${base.id}`;
  if (await tx.commissionEvent.findUnique({ where: { eventRef } })) return null;

  const referral = await tx.agentReferral.findFirst({
    where: { recruitAgentId: base.agentId, status: "APPROVED", createdAt: { lte: base.occurredAt }, OR: [{ endedAt: null }, { endedAt: { gt: base.occurredAt } }] },
    include: { referrer: true, recruit: true },
  });
  if (!referral || referral.referrer.status === "REJECTED" || referral.referrerAgentId === base.agentId) return null;

  const rule = selectRule(await activeRules(tx, refType), { type: refType, at: base.occurredAt, merchantId: base.merchantId });
  if (!rule) return null;
  const calc = calculateReferralShare(rule, { baseEventRef: base.eventRef, baseNetAmount: net(base), recruitCode: referral.recruit.agentCode });
  if (calc.amount <= 0n) return null;

  const now = new Date();
  const event = await createEventWithAccrual(tx, {
    eventRef, type: refType, status: "ELIGIBLE", eligibleAt: now, agentId: referral.referrerAgentId, amount: calc.amount, ruleId: rule.id,
    ruleCode: rule.code, ruleVersion: rule.version, ruleSnapshot: snapshotRule(rule) as never, calculation: calc.calculation as never,
    sourceEventId: base.id, merchantId: base.merchantId, productId: base.productId, occurredAt: base.occurredAt, businessDate: base.businessDate,
    holdUntil: now, isDemo: base.isDemo || rule.isDemo,
  }, actor);
  await tx.referralCommission.create({
    data: { referralId: referral.id, referrerAgentId: referral.referrerAgentId, recruitAgentId: base.agentId, baseEventId: base.id, referralEventId: event.id, baseAmount: net(base), rateBps: rule.rateBps!, amount: calc.amount },
  });
  if (rule.deductFromRecruit) {
    await tx.commissionEvent.update({ where: { id: base.id }, data: { deductedAmount: calc.amount } });
    await postJournal(tx, {
      journalRef: `REFDEDUCT:${base.id}`, kind: "ADJUSTMENT", agentId: base.agentId, createdById: actor.userId,
      description: `Potongan bagi hasil referral dari ${base.eventRef}`,
      lines: [dr("AGENT_PENDING", calc.amount, { agentId: base.agentId, commissionEventId: base.id }), cr("COMMISSION_EXPENSE", calc.amount, { commissionEventId: base.id })],
    });
  }
  await notifyUser(tx, referral.referrer.userId, "referral.earned", { amount: formatRupiah(calc.amount), recruit: referral.recruit.fullName }, "/agent/referrals");
  return event;
}

// ─────────────────────────────── Release lifecycle ───────────────────────────────

async function releaseBlockers(tx: Tx, e: CommissionEvent): Promise<string[]> {
  const reasons: string[] = [];
  const agent = await tx.agent.findUniqueOrThrow({ where: { id: e.agentId } });
  if (agent.status !== "ACTIVE") reasons.push(`AGENT_${agent.status}`);
  if (await blockingFlagCount(tx, { agentId: e.agentId, merchantId: e.merchantId, transactionId: e.sourceTransactionId })) reasons.push("OPEN_FRAUD_FLAG");
  if (e.sourceOrderId) {
    const o = await tx.salesOrder.findUniqueOrThrow({ where: { id: e.sourceOrderId }, include: { merchant: true } });
    if (o.status !== "ACTIVATED") reasons.push(`ORDER_${o.status}`);
    if (["SUSPENDED", "REFUNDED", "CANCELLED"].includes(o.merchant.status)) reasons.push(`MERCHANT_${o.merchant.status}`);
  }
  if (e.sourceTransactionId) {
    const t = await tx.transaction.findUniqueOrThrow({ where: { id: e.sourceTransactionId } });
    if (t.status !== "SUCCESS") reasons.push(`TRANSACTION_${t.status}`);
  }
  if (e.sourceEventId) {
    const b = await tx.commissionEvent.findUniqueOrThrow({ where: { id: e.sourceEventId } });
    if (b.status === "REVERSED" || b.status === "DISPUTED") reasons.push(`BASE_${b.status}`);
  }
  return reasons;
}

async function moveToPayable(tx: Tx, e: CommissionEvent, actor: Actor) {
  const wallet = await lockWallet(tx, e.agentId);
  const amount = net(e);
  if (amount > 0n) {
    const recover = minRupiah(wallet.receivableBalance, amount);
    await postJournal(tx, {
      journalRef: `RELEASE:${e.id}`, kind: recover > 0n ? "CLAWBACK_RECOVERY" : "RELEASE", agentId: e.agentId, createdById: actor.userId,
      description: recover > 0n ? `Rilis ${e.eventRef} (dikurangi pemulihan clawback ${recover})` : `Rilis ${e.eventRef} ke saldo dapat ditarik`,
      lines: [
        dr("AGENT_PENDING", amount, { agentId: e.agentId, commissionEventId: e.id }),
        cr("AGENT_RECEIVABLE", recover, { agentId: e.agentId, commissionEventId: e.id }),
        cr("AGENT_PAYABLE", amount - recover, { agentId: e.agentId, commissionEventId: e.id }),
      ],
    });
  }
  await tx.commissionEvent.update({ where: { id: e.id }, data: { status: "PAYABLE", payableAt: new Date() } });
}

export interface ReleaseStats { eligible: number; approved: number; payable: number; blocked: number; referrals: number }

/**
 * Advance commission events: PENDING (hold passed, no blockers) → ELIGIBLE → APPROVED (auto unless the
 * rule requires manual approval) → PAYABLE. Each event is processed in its own transaction.
 */
export async function releaseCommissions(actor: Actor = SYSTEM_ACTOR, now = new Date()): Promise<ReleaseStats> {
  if (actor.kind !== "system") requirePermission(actor, "commission.release");
  const stats: ReleaseStats = { eligible: 0, approved: 0, payable: 0, blocked: 0, referrals: 0 };
  const touchedAgents = new Set<string>();

  const pending = await prisma.commissionEvent.findMany({ where: { status: "PENDING", holdUntil: { lte: now } }, select: { id: true }, orderBy: { occurredAt: "asc" }, take: 5000 });
  for (const { id } of pending) {
    await withTx(async (tx) => {
      const e = await lockEvent(tx, id);
      if (!e || e.status !== "PENDING") return;
      const blockers = await releaseBlockers(tx, e);
      if (blockers.length) { stats.blocked++; return; }
      const updated = await tx.commissionEvent.update({ where: { id }, data: { status: "ELIGIBLE", eligibleAt: now } });
      stats.eligible++;
      if (e.type === "SALES" && e.merchantId) {
        await tx.merchant.updateMany({ where: { id: e.merchantId, status: "ACTIVATED" }, data: { status: "COMMISSION_ELIGIBLE" } });
      }
      if (await createReferralShare(tx, updated, actor)) stats.referrals++;
    });
  }

  const eligible = await prisma.commissionEvent.findMany({ where: { status: "ELIGIBLE" }, select: { id: true }, orderBy: { occurredAt: "asc" }, take: 5000 });
  for (const { id } of eligible) {
    await withTx(async (tx) => {
      const e = await lockEvent(tx, id);
      if (!e || e.status !== "ELIGIBLE") return;
      if ((e.ruleSnapshot as { requiresManualApproval?: boolean }).requiresManualApproval) return;
      await tx.commissionEvent.update({ where: { id }, data: { status: "APPROVED", approvedAt: now } });
      stats.approved++;
    });
  }

  const approved = await prisma.commissionEvent.findMany({ where: { status: "APPROVED" }, select: { id: true }, orderBy: { occurredAt: "asc" }, take: 5000 });
  for (const { id } of approved) {
    await withTx(async (tx) => {
      const e = await lockEvent(tx, id);
      if (!e || e.status !== "APPROVED") return;
      const blockers = await releaseBlockers(tx, e);
      if (blockers.length) { stats.blocked++; return; }
      await moveToPayable(tx, e, actor);
      await refreshPaidStatuses(tx, e.agentId);
      touchedAgents.add(e.agentId);
      stats.payable++;
    });
  }

  for (const agentId of touchedAgents) {
    const a = await prisma.agent.findUnique({ where: { id: agentId }, include: { wallet: true } });
    if (a?.wallet) await notifyUser(prisma, a.userId, "commission.payable", { amount: formatRupiah(a.wallet.payableBalance) }, "/agent/wallet");
  }
  return stats;
}

/**
 * Derive PAID vs PAYABLE labels. Coverage = (net of valid released events) − payable − reserved:
 * whatever has left the agent's withdrawable balances has been paid out (or offset against a
 * clawback). Oldest released events are covered first. Money correctness never depends on this.
 */
export async function refreshPaidStatuses(tx: Tx, agentId: string): Promise<void> {
  const wallet = await tx.wallet.findUniqueOrThrow({ where: { agentId } });
  const released = await tx.commissionEvent.findMany({
    where: { agentId, status: { in: ["PAYABLE", "PAID"] } },
    select: { id: true, amount: true, deductedAmount: true, status: true },
    orderBy: [{ payableAt: "asc" }, { id: "asc" }],
  });
  let coverage = released.reduce((s, e) => s + net(e), 0n) - wallet.payableBalance - wallet.reservedBalance;
  const now = new Date();
  const toPaid: string[] = [];
  const toPayable: string[] = [];
  for (const e of released) {
    const covered = net(e) <= coverage;
    if (covered) coverage -= net(e);
    if (covered && e.status !== "PAID") toPaid.push(e.id);
    if (!covered && e.status === "PAID") toPayable.push(e.id);
  }
  if (toPaid.length) await tx.commissionEvent.updateMany({ where: { id: { in: toPaid } }, data: { status: "PAID", paidAt: now } });
  if (toPayable.length) await tx.commissionEvent.updateMany({ where: { id: { in: toPayable } }, data: { status: "PAYABLE", paidAt: null } });
}

// ─────────────────────────────── Manual approval ───────────────────────────────

export async function approveCommissions(actor: Actor, eventIds: string[]) {
  requirePermission(actor, "commission.approve");
  let count = 0;
  for (const id of eventIds) {
    await withTx(async (tx) => {
      const e = await lockEvent(tx, id);
      if (!e) throw notFound("Komisi");
      if (e.status !== "ELIGIBLE") throw ruleError(`Komisi ${e.eventRef} tidak dalam status ELIGIBLE.`);
      await tx.commissionEvent.update({ where: { id }, data: { status: "APPROVED", approvedAt: new Date(), approvedById: actor.userId } });
      await audit(tx, actor, { action: "commission.approve", entityType: "CommissionEvent", entityId: id, before: { status: e.status }, after: { status: "APPROVED" } });
      count++;
    });
  }
  return count;
}

// ─────────────────────────────── Reversal & clawback ───────────────────────────────

/**
 * Reverse a commission event (refund, fraud, transaction reversal). Never edits the event amount.
 * Pending-side money is reversed from AGENT_PENDING; released money from AGENT_PAYABLE up to the
 * available balance, the rest becomes AGENT_RECEIVABLE (clawback) recovered from future releases.
 * Derived referral events are reversed as well.
 */
export async function reverseCommissionEvent(tx: Tx, eventId: string, reason: string, actor: Actor): Promise<boolean> {
  const e = await lockEvent(tx, eventId);
  if (!e) throw notFound("Komisi");
  if (e.status === "REVERSED") return false;
  const amount = net(e);
  const wallet = await lockWallet(tx, e.agentId);
  const pendingSide = ["PENDING", "ELIGIBLE", "APPROVED", "DISPUTED"].includes(e.status);
  let clawback = 0n;
  if (amount > 0n) {
    if (pendingSide) {
      await postJournal(tx, {
        journalRef: `REVERSAL:${e.id}`, kind: "REVERSAL", agentId: e.agentId, createdById: actor.userId, description: `Pembatalan ${e.eventRef}: ${reason}`,
        lines: [dr("AGENT_PENDING", amount, { agentId: e.agentId, commissionEventId: e.id }), cr("COMMISSION_EXPENSE", amount, { commissionEventId: e.id })],
      });
    } else {
      const fromPayable = minRupiah(wallet.payableBalance, amount);
      clawback = amount - fromPayable;
      await postJournal(tx, {
        journalRef: `REVERSAL:${e.id}`, kind: clawback > 0n ? "CLAWBACK" : "REVERSAL", agentId: e.agentId, createdById: actor.userId,
        description: clawback > 0n ? `Clawback ${e.eventRef}: ${reason}` : `Pembatalan ${e.eventRef}: ${reason}`,
        lines: [
          dr("AGENT_PAYABLE", fromPayable, { agentId: e.agentId, commissionEventId: e.id }),
          dr("AGENT_RECEIVABLE", clawback, { agentId: e.agentId, commissionEventId: e.id }),
          cr("COMMISSION_EXPENSE", amount, { commissionEventId: e.id }),
        ],
      });
    }
  }
  await tx.commissionEvent.update({ where: { id: e.id }, data: { status: "REVERSED", reversedAt: new Date(), reversalReason: reason, paidAt: null } });
  if (e.sourceTransactionId) await tx.transaction.update({ where: { id: e.sourceTransactionId }, data: { rewardStatus: "REVERSED" } });
  await audit(tx, actor, { action: "commission.reverse", entityType: "CommissionEvent", entityId: e.id, before: { status: e.status }, after: { status: "REVERSED", reason, clawback: clawback.toString() } });

  // Referral event reversed on its own while the base stays valid → restore any deduction to the recruit.
  if (e.sourceEventId && (e.type === "REFERRAL_SALES" || e.type === "REFERRAL_TRANSACTION")) {
    const base = await lockEvent(tx, e.sourceEventId);
    if (base && base.status !== "REVERSED" && base.deductedAmount > 0n) {
      const restoreTo = ["PAYABLE", "PAID"].includes(base.status) ? "AGENT_PAYABLE" : "AGENT_PENDING";
      await postJournal(tx, {
        journalRef: `REFRESTORE:${base.id}`, kind: "ADJUSTMENT", agentId: base.agentId, createdById: actor.userId, description: `Pengembalian potongan referral ${base.eventRef}`,
        lines: [dr("COMMISSION_EXPENSE", base.deductedAmount, { commissionEventId: base.id }), cr(restoreTo, base.deductedAmount, { agentId: base.agentId, commissionEventId: base.id })],
      });
      await tx.commissionEvent.update({ where: { id: base.id }, data: { deductedAmount: 0n } });
      await refreshPaidStatuses(tx, base.agentId);
    }
  }

  const derived = await tx.commissionEvent.findMany({ where: { sourceEventId: e.id, status: { not: "REVERSED" } }, select: { id: true } });
  for (const d of derived) await reverseCommissionEvent(tx, d.id, `Komisi dasar ${e.eventRef} dibatalkan: ${reason}`, actor);

  await refreshPaidStatuses(tx, e.agentId);
  const agent = await tx.agent.findUniqueOrThrow({ where: { id: e.agentId } });
  await notifyUser(tx, agent.userId, "commission.reversed", { amount: formatRupiah(e.amount), reason }, "/agent/earnings");
  return true;
}

export async function reverseCommission(actor: Actor, eventId: string, reason: string) {
  requirePermission(actor, "commission.reverse");
  if (reason.trim().length < 5) throw new AppError("VALIDATION", "Alasan pembatalan wajib diisi (min. 5 karakter).");
  return withTx((tx) => reverseCommissionEvent(tx, eventId, reason.trim(), actor));
}

// ─────────────────────────────── Disputes ───────────────────────────────

export async function disputeCommission(actor: Actor, eventId: string, reason: string) {
  const isAdmin = actor.roles.some((r) => r !== "AGENT" && r !== "MERCHANT");
  if (isAdmin) requirePermission(actor, "dispute.manage");
  return withTx(async (tx) => {
    const e = await lockEvent(tx, eventId);
    if (!e) throw notFound("Komisi");
    if (!isAdmin && e.agentId !== actor.agentId) throw forbidden();
    const dispute = await tx.dispute.create({ data: { type: "COMMISSION", commissionEventId: e.id, agentId: e.agentId, raisedById: actor.userId!, description: reason } });
    // Only money still on the pending side can be frozen; released money is handled by reversal.
    if (["PENDING", "ELIGIBLE", "APPROVED"].includes(e.status)) {
      await tx.commissionEvent.update({ where: { id: e.id }, data: { status: "DISPUTED", disputedAt: new Date(), disputeReason: reason } });
    }
    await audit(tx, actor, { action: "commission.dispute", entityType: "CommissionEvent", entityId: e.id, after: { disputeId: dispute.id, reason } });
    return dispute;
  });
}

export async function resolveDispute(actor: Actor, disputeId: string, outcome: "UPHOLD_COMMISSION" | "REVERSE_COMMISSION" | "REJECT", resolution: string) {
  requirePermission(actor, "dispute.manage");
  return withTx(async (tx) => {
    const d = await tx.dispute.findUnique({ where: { id: disputeId } });
    if (!d || d.status !== "OPEN") throw notFound("Sengketa terbuka");
    if (d.commissionEventId) {
      const e = await lockEvent(tx, d.commissionEventId);
      if (e && outcome === "REVERSE_COMMISSION") await reverseCommissionEvent(tx, e.id, `Sengketa: ${resolution}`, actor);
      else if (e && e.status === "DISPUTED") await tx.commissionEvent.update({ where: { id: e.id }, data: { status: "PENDING" } });
    }
    await tx.dispute.update({ where: { id: d.id }, data: { status: outcome === "REJECT" ? "REJECTED" : "RESOLVED", resolution, resolvedById: actor.userId, resolvedAt: new Date() } });
    await audit(tx, actor, { action: "dispute.resolve", entityType: "Dispute", entityId: d.id, after: { outcome, resolution } });
  });
}

// ─────────────────────────────── Queries ───────────────────────────────

/** Explainable view of one commission: source, rate, beneficiary, rule version, ledger trail. */
export async function explainCommission(actor: Actor, eventId: string) {
  const e = await prisma.commissionEvent.findUnique({
    where: { id: eventId },
    include: {
      agent: { select: { id: true, agentCode: true, fullName: true } },
      ledgerEntries: { include: { journal: true }, orderBy: { createdAt: "asc" } },
      referralAsPaid: { include: { baseEvent: { select: { eventRef: true, amount: true, agentId: true } } } },
    },
  });
  if (!e) throw notFound("Komisi");
  const own = actor.agentId && e.agentId === actor.agentId;
  if (!own) requirePermission(actor, "commission.view");
  const [order, txn, merchant] = await Promise.all([
    e.sourceOrderId ? prisma.salesOrder.findUnique({ where: { id: e.sourceOrderId }, include: { product: { select: { name: true, sku: true } } } }) : null,
    e.sourceTransactionId ? prisma.transaction.findUnique({ where: { id: e.sourceTransactionId }, select: { source: true, externalId: true, terminalId: true, type: true, amount: true, occurredAt: true, settlementRef: true } }) : null,
    e.merchantId ? prisma.merchant.findUnique({ where: { id: e.merchantId }, select: { merchantCode: true, businessName: true } }) : null,
  ]);
  return { event: e, order, transaction: txn, merchant };
}
