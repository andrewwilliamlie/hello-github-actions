import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { addDevices, makeAdmin, makeAgent, makeProduct, makeRule, release, resetDb, wallet } from "../support/fixtures";
import { onboardAndActivate } from "../support/flows";
import { ingestSettlements, ingestTransactions, runReconciliation } from "@/server/modules/transactions";
import { requestWithdrawal, reviewWithdrawal, createPayoutBatch, approvePayoutBatch, recordPayoutTransfer, confirmPayoutTransfer } from "@/server/modules/withdrawals";
import { refundOrder } from "@/server/modules/merchants";
import { ledgerBalances } from "@/server/ledger";
import { addDays, businessDateString } from "@/lib/time";
import type { Actor } from "@/server/rbac";

/**
 * Full vertical slice: approved agents → merchant onboarding → sale → activation → sales commission
 * → settled transaction → Rp500 reward → referral share → withdrawal → maker-checker payout →
 * refund after payout (clawback) → recovery from later earnings.
 */
describe("end-to-end commission lifecycle", () => {
  let ops: Actor, fin1: Actor, fin2: Actor;
  let referrer: Awaited<ReturnType<typeof makeAgent>>, recruit: Awaited<ReturnType<typeof makeAgent>>;
  let productId: string;
  let ids: Awaited<ReturnType<typeof onboardAndActivate>>;
  const activatedAt = new Date(Date.now() - 1000);

  beforeAll(async () => {
    await resetDb();
    ops = await makeAdmin(["OPERATIONS_ADMIN"], "ops");
    fin1 = await makeAdmin(["FINANCE_ADMIN"], "fin");
    fin2 = await makeAdmin(["FINANCE_ADMIN"], "fin");
    const p = await makeProduct("A920PRO", 2_750_000n);
    productId = p.id;
    await addDevices(productId, ["SN-0001", "SN-0002"]);
    await makeRule({ code: "SALES:A920PRO", type: "SALES", productId, fixedAmount: 100_000n, holdDays: 7 });
    await makeRule({ code: "TXN:DEFAULT", type: "TRANSACTION_REWARD", fixedAmount: 500n });
    await makeRule({ code: "REF:SALES", type: "REFERRAL_SALES", rateBps: 1000 });
    await makeRule({ code: "REF:TXN", type: "REFERRAL_TRANSACTION", rateBps: 500 });
    referrer = await makeAgent({ name: "Referrer" });
    recruit = await makeAgent({ name: "Recruit", referrerAgentId: referrer.agentId });
  });

  it("accrues exactly one pending sales commission on activation", async () => {
    ids = await onboardAndActivate(recruit, ops, { productId, n: 1, serial: "SN-0001", terminalId: "TID00001", activatedAt });
    const events = await prisma.commissionEvent.findMany({ where: { agentId: recruit.agentId } });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: "SALES", status: "PENDING", amount: 100_000n, ruleCode: "SALES:A920PRO", ruleVersion: 1 });
    expect((await wallet(recruit.agentId)).pendingBalance).toBe(100_000n);
    const merchant = await prisma.merchant.findUniqueOrThrow({ where: { id: ids.merchantId } });
    expect(merchant.status).toBe("ACTIVATED");
    expect(merchant.merchantCode).toMatch(/^HJM-\d{6}$/);
  });

  it("keeps the commission pending during the refund/fraud hold window", async () => {
    await release(new Date());
    const e = await prisma.commissionEvent.findFirstOrThrow({ where: { agentId: recruit.agentId, type: "SALES" } });
    expect(e.status).toBe("PENDING");
  });

  it("releases after the hold: eligible → approved → payable, and creates the referrer's share", async () => {
    const stats = await release(addDays(activatedAt, 8));
    expect(stats.payable).toBeGreaterThanOrEqual(2);
    const sale = await prisma.commissionEvent.findFirstOrThrow({ where: { agentId: recruit.agentId, type: "SALES" } });
    expect(sale.status).toBe("PAYABLE");
    const ref = await prisma.commissionEvent.findFirstOrThrow({ where: { agentId: referrer.agentId, type: "REFERRAL_SALES" } });
    expect(ref.amount).toBe(10_000n); // 10% of recruit's eligible net 100.000
    expect(ref.sourceEventId).toBe(sale.id);
    expect((await wallet(recruit.agentId)).payableBalance).toBe(100_000n); // recruit not reduced
    expect((await wallet(referrer.agentId)).payableBalance).toBe(10_000n);
    expect((await prisma.merchant.findUniqueOrThrow({ where: { id: ids.merchantId } })).status).toBe("COMMISSION_ELIGIBLE");
  });

  it("rewards Rp500 only for settled, successful, non-test transactions — once", async () => {
    const when = new Date();
    const ts = when.toISOString();
    const items = [
      { externalId: "T-1", terminalId: "TID00001", status: "SUCCESS", amount: 150000, occurredAt: ts, settlementRef: "STL-1", type: "PURCHASE" },
      { externalId: "T-2", terminalId: "TID00001", status: "FAILED", amount: 50000, occurredAt: ts, settlementRef: "STL-1" },
      { externalId: "T-3", terminalId: "TID00001", status: "SUCCESS", amount: 1000, occurredAt: ts, settlementRef: "STL-1", isTest: true },
      { externalId: "T-4", terminalId: "TID00001", status: "PENDING", amount: 20000, occurredAt: ts },
    ];
    const r1 = await ingestTransactions(fin1, "PARTNER_A", items, "API");
    expect(r1.map((r) => r.result)).toEqual(["CREATED", "CREATED", "CREATED", "CREATED"]);
    // Not settled yet → no reward
    expect(await prisma.commissionEvent.count({ where: { type: "TRANSACTION_REWARD" } })).toBe(0);
    const replay = await ingestTransactions(fin1, "PARTNER_A", [items[0]], "API");
    expect(replay[0].result).toBe("DUPLICATE");

    // Settlement totals: only SUCCESS rows count (T-1 + test T-3 are SUCCESS → 2 rows, 151000)
    await ingestSettlements(fin1, "PARTNER_A", [{ settlementRef: "STL-1", settlementDate: businessDateString(when), expectedCount: 2, expectedAmount: 151000 }]);
    const run = await runReconciliation(ops, businessDateString(new Date()));
    expect(run.stats.settlementsReconciled).toBe(1);
    const rewards = await prisma.commissionEvent.findMany({ where: { type: "TRANSACTION_REWARD" } });
    expect(rewards).toHaveLength(1);
    expect(rewards[0]).toMatchObject({ amount: 500n, agentId: recruit.agentId });
    const t2 = await prisma.transaction.findFirstOrThrow({ where: { externalId: "T-2" } });
    const t3 = await prisma.transaction.findFirstOrThrow({ where: { externalId: "T-3" } });
    expect(t2.rewardStatus).toBe("INELIGIBLE");
    expect(t3.rewardStatus).toBe("INELIGIBLE");
    // Re-running reconciliation is idempotent
    await runReconciliation(ops, businessDateString(new Date()));
    expect(await prisma.commissionEvent.count({ where: { type: "TRANSACTION_REWARD" } })).toBe(1);

    await release(addDays(new Date(), 1));
    const refTxn = await prisma.commissionEvent.findFirstOrThrow({ where: { type: "REFERRAL_TRANSACTION" } });
    expect(refTxn.amount).toBe(25n); // 5% of 500
    expect((await wallet(recruit.agentId)).payableBalance).toBe(100_500n);
  });

  it("pays out through maker-checker and marks events PAID only after confirmation", async () => {
    const w = await requestWithdrawal(recruit, { amount: 100_000n, idempotencyKey: "wd-test-0001" });
    expect((await wallet(recruit.agentId)).reservedBalance).toBe(100_000n);
    await reviewWithdrawal(fin1, w.id, "APPROVED");
    const batch = await createPayoutBatch(fin1, [w.id]);
    await expect(approvePayoutBatch(fin1, batch.id)).rejects.toThrow(/maker-checker/);
    await approvePayoutBatch(fin2, batch.id);
    const attempt = await prisma.payoutAttempt.findFirstOrThrow({ where: { withdrawalId: w.id } });
    await recordPayoutTransfer(fin1, attempt.id, { providerReference: "BCA-REF-0001" });
    expect((await prisma.withdrawalRequest.findUniqueOrThrow({ where: { id: w.id } })).status).toBe("PROCESSING");
    await expect(confirmPayoutTransfer(fin1, attempt.id)).rejects.toThrow(/maker-checker/);
    await confirmPayoutTransfer(fin2, attempt.id);
    await expect(confirmPayoutTransfer(fin2, attempt.id)).rejects.toThrow();
    const wl = await wallet(recruit.agentId);
    expect(wl).toMatchObject({ reservedBalance: 0n, payableBalance: 500n, paidTotal: 100_000n });
    const sale = await prisma.commissionEvent.findFirstOrThrow({ where: { agentId: recruit.agentId, type: "SALES" } });
    expect(sale.status).toBe("PAID");
  });

  it("refund after payout reverses the sale, claws back and cascades to the referral share", async () => {
    await refundOrder(fin1, ids.orderId, "Merchant returned the device");
    const sale = await prisma.commissionEvent.findFirstOrThrow({ where: { agentId: recruit.agentId, type: "SALES" } });
    expect(sale.status).toBe("REVERSED");
    expect(sale.amount).toBe(100_000n); // never edited
    const wl = await wallet(recruit.agentId);
    expect(wl.payableBalance).toBe(0n); // 500 taken from payable
    expect(wl.receivableBalance).toBe(99_500n); // remainder is clawback
    const refSale = await prisma.commissionEvent.findFirstOrThrow({ where: { type: "REFERRAL_SALES" } });
    expect(refSale.status).toBe("REVERSED");
    // The Rp500 transaction reward is untouched; device returned to inventory
    expect((await prisma.device.findUniqueOrThrow({ where: { id: ids.deviceId } })).status).toBe("RETURNED");
  });

  it("recovers the clawback from later earnings before paying out new money", async () => {
    const extra = await onboardAndActivate(recruit, ops, { productId, n: 2, serial: "SN-0002", terminalId: "TID00002", activatedAt });
    await release(addDays(new Date(), 9));
    const wl = await wallet(recruit.agentId);
    expect(wl.receivableBalance).toBe(0n);
    expect(wl.payableBalance).toBe(500n); // 100.000 − 99.500 recovery
    const e = await prisma.commissionEvent.findFirstOrThrow({ where: { sourceOrderId: extra.orderId } });
    expect(e.status).toBe("PAYABLE");
  });

  it("wallet cache always equals balances recomputed from the immutable ledger", async () => {
    for (const a of [recruit, referrer]) {
      const cached = await wallet(a.agentId);
      const fromLedger = await prisma.$transaction((tx) => ledgerBalances(tx, a.agentId));
      expect(fromLedger).toEqual({ pendingBalance: cached.pendingBalance, payableBalance: cached.payableBalance, reservedBalance: cached.reservedBalance, receivableBalance: cached.receivableBalance });
    }
    // Every journal balances
    const unbalanced = await prisma.$queryRaw<{ n: bigint }[]>`
      SELECT COUNT(*)::bigint AS n FROM (SELECT "journalId", SUM(CASE WHEN "direction"='DEBIT' THEN "amount" ELSE -"amount" END) s FROM "CommissionLedgerEntry" GROUP BY 1) x WHERE s <> 0`;
    expect(unbalanced[0].n).toBe(0n);
  });
});
