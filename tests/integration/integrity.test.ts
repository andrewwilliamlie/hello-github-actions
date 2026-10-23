import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { addDevices, LEAD, makeAdmin, makeAgent, makeProduct, makeRule, release, resetDb, wallet } from "../support/fixtures";
import { onboardAndActivate } from "../support/flows";
import { accrueSalesCommission, reverseCommissionEvent } from "@/server/modules/commissions";
import { ingestSettlements, ingestTransactions, runReconciliation } from "@/server/modules/transactions";
import { createLead, assignDevice, activateDevice, submitPayment } from "@/server/modules/merchants";
import { requestWithdrawal, reviewWithdrawal, createPayoutBatch, approvePayoutBatch, recordPayoutTransfer, confirmPayoutTransfer, failPayoutAttempt, retryPayout, returnFailedWithdrawal } from "@/server/modules/withdrawals";
import { createRuleVersion, decideRule, submitRule } from "@/server/modules/rules";
import { postJournal, cr, dr } from "@/server/ledger";
import { addDays, businessDateString } from "@/lib/time";
import { SYSTEM_ACTOR, type Actor } from "@/server/rbac";

let ops: Actor, fin1: Actor, fin2: Actor, productId: string;
async function base() {
  await resetDb();
  ops = await makeAdmin(["OPERATIONS_ADMIN"], "ops");
  fin1 = await makeAdmin(["FINANCE_ADMIN"], "fin");
  fin2 = await makeAdmin(["FINANCE_ADMIN"], "fin");
  productId = (await makeProduct()).id;
  await addDevices(productId, ["D1", "D2", "D3", "D4"]);
  await makeRule({ code: "SALES:P", type: "SALES", productId, fixedAmount: 100_000n });
  await makeRule({ code: "TXN", type: "TRANSACTION_REWARD", fixedAmount: 500n });
}
const txn = (id: string, tid: string, extra: object = {}) => ({ externalId: id, terminalId: tid, status: "SUCCESS", amount: 20000, occurredAt: new Date().toISOString(), settlementRef: "STL-X", ...extra });

describe("duplicate prevention", () => {
  beforeEach(base);

  it("accrues one sales commission per order, however often activation logic is replayed", async () => {
    const agent = await makeAgent();
    const ids = await onboardAndActivate(agent, ops, { productId, n: 1, serial: "D1", terminalId: "TIDD0001" });
    await prisma.$transaction((tx) => accrueSalesCommission(tx, ids.orderId, SYSTEM_ACTOR));
    await prisma.$transaction((tx) => accrueSalesCommission(tx, ids.orderId, SYSTEM_ACTOR));
    expect(await prisma.commissionEvent.count({ where: { sourceOrderId: ids.orderId } })).toBe(1);
    expect((await wallet(agent.agentId)).pendingBalance).toBe(100_000n);
  });

  it("rewards a transaction once even under concurrent duplicate ingestion", async () => {
    const agent = await makeAgent();
    await onboardAndActivate(agent, ops, { productId, n: 1, serial: "D1", terminalId: "TIDD0001" });
    await ingestSettlements(fin1, "PARTNER_A", [{ settlementRef: "STL-X", settlementDate: businessDateString(new Date()), expectedCount: 1, expectedAmount: 20000 }]);
    const results = await Promise.all(Array.from({ length: 6 }, () => ingestTransactions(fin1, "PARTNER_A", [txn("DUP-1", "TIDD0001")], "API")));
    expect(results.flat().filter((r) => r.result === "CREATED")).toHaveLength(1);
    await runReconciliation(ops, businessDateString(new Date()));
    await runReconciliation(ops, businessDateString(new Date()));
    expect(await prisma.transaction.count()).toBe(1);
    expect(await prisma.commissionEvent.count({ where: { type: "TRANSACTION_REWARD" } })).toBe(1);
  });

  it("prevents duplicate merchants, devices, terminal ids and payment references", async () => {
    const a = await makeAgent();
    const b = await makeAgent();
    await createLead(a, LEAD(productId, 7));
    await expect(createLead(b, LEAD(productId, 7))).rejects.toThrow(/diproses|terdaftar/); // attribution theft blocked
    const one = await onboardAndActivate(a, ops, { productId, n: 1, serial: "D1", terminalId: "TIDD0001" });
    // Same device cannot go to another order; same terminal id cannot be reused
    const second = await onboardAndActivate(a, ops, { productId, n: 2, serial: "D2", terminalId: "TIDD0002" }).catch((e) => e);
    expect(second).not.toBeInstanceOf(Error);
    const lead3 = await createLead(a, LEAD(productId, 3));
    expect(lead3.id).toBeTruthy();
    const order1 = await prisma.salesOrder.findUniqueOrThrow({ where: { id: one.orderId } });
    await expect(submitPayment(a, order1.id, { amount: 1n, method: "BANK_TRANSFER", reference: "x" })).rejects.toThrow(/tidak menunggu/);
    const order2 = await prisma.salesOrder.findFirstOrThrow({ where: { id: { not: order1.id } } });
    await expect(assignDevice(ops, order2.id, one.deviceId)).rejects.toThrow();
    await expect(activateDevice(ops, order2.id, { terminalId: "TIDD0001" })).rejects.toThrow();
  });
});

describe("concurrency & balances", () => {
  beforeEach(base);

  it("allows exactly one of many concurrent withdrawals and never goes negative", async () => {
    const agent = await makeAgent();
    await onboardAndActivate(agent, ops, { productId, n: 1, serial: "D1", terminalId: "TIDD0001" });
    await release(addDays(new Date(), 1));
    const results = await Promise.allSettled(Array.from({ length: 8 }, (_, i) => requestWithdrawal(agent, { amount: 100_000n, idempotencyKey: `concurrent-${i}-xxxx` })));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const w = await wallet(agent.agentId);
    expect(w).toMatchObject({ payableBalance: 0n, reservedBalance: 100_000n });
    await expect(requestWithdrawal(agent, { amount: 1n, idempotencyKey: "too-much-0001" })).rejects.toThrow();
  });

  it("returns the same withdrawal for a repeated idempotency key", async () => {
    const agent = await makeAgent();
    await onboardAndActivate(agent, ops, { productId, n: 1, serial: "D1", terminalId: "TIDD0001" });
    await release(addDays(new Date(), 1));
    const a = await requestWithdrawal(agent, { amount: 100_000n, idempotencyKey: "same-key-0001" });
    const b = await requestWithdrawal(agent, { amount: 100_000n, idempotencyKey: "same-key-0001" });
    expect(b.id).toBe(a.id);
  });

  it("rejects withdrawals over the payable balance or under the minimum", async () => {
    const agent = await makeAgent();
    await expect(requestWithdrawal(agent, { amount: 50_000n, idempotencyKey: "small-0001" })).rejects.toThrow(/Minimal/);
    await expect(requestWithdrawal(agent, { amount: 200_000n, idempotencyKey: "big-00001" })).rejects.toThrow(/mencukupi/);
  });

  it("confirms a payout exactly once under concurrent confirmation", async () => {
    const agent = await makeAgent();
    await onboardAndActivate(agent, ops, { productId, n: 1, serial: "D1", terminalId: "TIDD0001" });
    await release(addDays(new Date(), 1));
    const w = await requestWithdrawal(agent, { amount: 100_000n, idempotencyKey: "pay-once-0001" });
    await reviewWithdrawal(fin1, w.id, "APPROVED");
    const b = await createPayoutBatch(fin1, [w.id]);
    await approvePayoutBatch(fin2, b.id);
    const at = await prisma.payoutAttempt.findFirstOrThrow({ where: { withdrawalId: w.id } });
    await recordPayoutTransfer(fin1, at.id, { providerReference: "REF-ONCE-1" });
    const r = await Promise.allSettled([confirmPayoutTransfer(fin2, at.id), confirmPayoutTransfer(fin2, at.id), confirmPayoutTransfer(fin2, at.id)]);
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect((await wallet(agent.agentId)).paidTotal).toBe(100_000n);
    expect(await prisma.ledgerJournal.count({ where: { kind: "PAYOUT" } })).toBe(1);
  });

  it("handles failed payout → retry → confirm, and failed payout → funds returned", async () => {
    const agent = await makeAgent();
    await onboardAndActivate(agent, ops, { productId, n: 1, serial: "D1", terminalId: "TIDD0001" });
    await onboardAndActivate(agent, ops, { productId, n: 2, serial: "D2", terminalId: "TIDD0002" });
    await release(addDays(new Date(), 1));
    const w = await requestWithdrawal(agent, { amount: 100_000n, idempotencyKey: "retry-0001" });
    await reviewWithdrawal(fin1, w.id, "APPROVED");
    const b = await createPayoutBatch(fin1, [w.id]);
    await approvePayoutBatch(fin2, b.id);
    const a1 = await prisma.payoutAttempt.findFirstOrThrow({ where: { withdrawalId: w.id } });
    await failPayoutAttempt(fin1, a1.id, "Bank returned: account closed");
    await expect(requestWithdrawal(agent, { amount: 100_000n, idempotencyKey: "blocked-0001" })).rejects.toThrow(/diproses/);
    await retryPayout(fin1, w.id);
    await expect(retryPayout(fin1, w.id)).rejects.toThrow();
    const a2 = await prisma.payoutAttempt.findFirstOrThrow({ where: { withdrawalId: w.id, attemptNumber: 2 } });
    await recordPayoutTransfer(fin2, a2.id, { providerReference: "REF-RETRY-2" });
    await confirmPayoutTransfer(fin1, a2.id);
    expect((await prisma.withdrawalRequest.findUniqueOrThrow({ where: { id: w.id } })).status).toBe("PAID");

    const w2 = await requestWithdrawal(agent, { amount: 100_000n, idempotencyKey: "return-0001" });
    await reviewWithdrawal(fin1, w2.id, "APPROVED");
    const b2 = await createPayoutBatch(fin1, [w2.id]);
    await approvePayoutBatch(fin2, b2.id);
    const a3 = await prisma.payoutAttempt.findFirstOrThrow({ where: { withdrawalId: w2.id } });
    await failPayoutAttempt(fin1, a3.id, "Invalid account");
    await returnFailedWithdrawal(fin1, w2.id, "Agent must update bank account");
    expect(await wallet(agent.agentId)).toMatchObject({ payableBalance: 100_000n, reservedBalance: 0n, paidTotal: 100_000n });
  });

  it("rejection releases reserved funds back to payable", async () => {
    const agent = await makeAgent();
    await onboardAndActivate(agent, ops, { productId, n: 1, serial: "D1", terminalId: "TIDD0001" });
    await release(addDays(new Date(), 1));
    const w = await requestWithdrawal(agent, { amount: 100_000n, idempotencyKey: "reject-0001" });
    await reviewWithdrawal(fin1, w.id, "REJECTED", "Data rekening perlu dicek");
    expect(await wallet(agent.agentId)).toMatchObject({ payableBalance: 100_000n, reservedBalance: 0n });
  });
});

describe("reversals", () => {
  beforeEach(base);

  it("a processor reversal of a rewarded transaction reverses the reward", async () => {
    const agent = await makeAgent();
    await onboardAndActivate(agent, ops, { productId, n: 1, serial: "D1", terminalId: "TIDD0001" });
    await ingestSettlements(fin1, "PARTNER_A", [{ settlementRef: "STL-X", settlementDate: businessDateString(new Date()), expectedCount: 1, expectedAmount: 20000 }]);
    await ingestTransactions(fin1, "PARTNER_A", [txn("REV-1", "TIDD0001")], "API");
    await runReconciliation(ops, businessDateString(new Date()));
    expect((await wallet(agent.agentId)).pendingBalance).toBe(100_500n);
    const [r] = await ingestTransactions(fin1, "PARTNER_A", [txn("REV-1", "TIDD0001", { status: "REVERSED" })], "API");
    expect(r.result).toBe("UPDATED");
    expect((await wallet(agent.agentId)).pendingBalance).toBe(100_000n);
    expect((await prisma.commissionEvent.findFirstOrThrow({ where: { type: "TRANSACTION_REWARD" } })).status).toBe("REVERSED");
    // A later "SUCCESS" replay does not resurrect it
    const [again] = await ingestTransactions(fin1, "PARTNER_A", [txn("REV-1", "TIDD0001")], "API");
    expect(again.result).toBe("CONFLICT");
  });

  it("reversal is idempotent and claws back when money was already withdrawn", async () => {
    const agent = await makeAgent();
    const ids = await onboardAndActivate(agent, ops, { productId, n: 1, serial: "D1", terminalId: "TIDD0001" });
    await release(addDays(new Date(), 1));
    await requestWithdrawal(agent, { amount: 100_000n, idempotencyKey: "claw-0001" });
    const e = await prisma.commissionEvent.findFirstOrThrow({ where: { sourceOrderId: ids.orderId } });
    expect(await prisma.$transaction((tx) => reverseCommissionEvent(tx, e.id, "fraud", fin1))).toBe(true);
    expect(await prisma.$transaction((tx) => reverseCommissionEvent(tx, e.id, "fraud", fin1))).toBe(false);
    expect(await wallet(agent.agentId)).toMatchObject({ payableBalance: 0n, reservedBalance: 100_000n, receivableBalance: 100_000n });
  });
});

describe("database guarantees", () => {
  beforeEach(base);

  it("ledger and audit tables are append-only; commission amounts are immutable", async () => {
    const agent = await makeAgent();
    await onboardAndActivate(agent, ops, { productId, n: 1, serial: "D1", terminalId: "TIDD0001" });
    await expect(prisma.$executeRaw`UPDATE "CommissionLedgerEntry" SET "amount" = 1`).rejects.toThrow(/append-only/);
    await expect(prisma.$executeRaw`DELETE FROM "LedgerJournal"`).rejects.toThrow(/append-only/);
    await expect(prisma.$executeRaw`DELETE FROM "AuditLog"`).rejects.toThrow(/append-only/);
    await expect(prisma.$executeRaw`UPDATE "CommissionEvent" SET "amount" = 1`).rejects.toThrow(/immutable/);
    await expect(prisma.$executeRaw`UPDATE "Wallet" SET "payableBalance" = -1`).rejects.toThrow();
  });

  it("rejects unbalanced journals and negative wallet effects", async () => {
    const agent = await makeAgent();
    await expect(prisma.$transaction(async (tx) => {
      const j = await tx.ledgerJournal.create({ data: { journalRef: "bad-1", kind: "ADJUSTMENT", description: "bad" } });
      await tx.commissionLedgerEntry.create({ data: { journalId: j.id, account: "COMMISSION_EXPENSE", direction: "DEBIT", amount: 10n } });
    })).rejects.toThrow(/unbalanced/);
    await expect(prisma.$transaction((tx) => postJournal(tx, { journalRef: "neg-1", kind: "ADJUSTMENT", description: "x", lines: [dr("AGENT_PAYABLE", 5n, { agentId: agent.agentId }), cr("COMMISSION_EXPENSE", 5n)] }))).rejects.toThrow(/mencukupi/);
  });

  it("enforces maker-checker in the database too", async () => {
    const b = await prisma.payoutBatch.create({ data: { totalAmount: 1n, itemCount: 0, createdById: fin1.userId! } });
    await expect(prisma.payoutBatch.update({ where: { id: b.id }, data: { approvedById: fin1.userId } })).rejects.toThrow();
  });
});

describe("versioned rules keep history", () => {
  beforeEach(base);

  it("a new approved version applies to new sales only; old events keep their snapshot", async () => {
    const agent = await makeAgent();
    const first = await onboardAndActivate(agent, ops, { productId, n: 1, serial: "D1", terminalId: "TIDD0001" });
    const sup1 = await makeAdmin(["SUPER_ADMIN"], "sup");
    const sup2 = await makeAdmin(["SUPER_ADMIN"], "sup");
    const draft = await createRuleVersion(sup1, { code: "SALES:P", type: "SALES", name: "Naik", productId, fixedAmount: "125000", effectiveFrom: new Date(Date.now() + 1000) });
    await submitRule(sup1, draft.id);
    await expect(decideRule(fin1, draft.id, "approve")).rejects.toThrow(/akses/); // finance cannot approve rules
    await expect(decideRule(sup1, draft.id, "approve")).rejects.toThrow(/maker-checker/); // maker cannot approve own rule
    await decideRule(sup2, draft.id, "approve");
    await new Promise((r) => setTimeout(r, 1200));
    const second = await onboardAndActivate(agent, ops, { productId, n: 2, serial: "D2", terminalId: "TIDD0002" });
    const e1 = await prisma.commissionEvent.findFirstOrThrow({ where: { sourceOrderId: first.orderId } });
    const e2 = await prisma.commissionEvent.findFirstOrThrow({ where: { sourceOrderId: second.orderId } });
    expect(e1).toMatchObject({ amount: 100_000n, ruleVersion: 1 });
    expect(e2).toMatchObject({ amount: 125_000n, ruleVersion: 2 });
    expect((e1.ruleSnapshot as { fixedAmount: string }).fixedAmount).toBe("100000");
  });

  it("refuses sales rules outside the configured Rp50.000–Rp150.000 range", async () => {
    await expect(createRuleVersion(fin1, { code: "SALES:Z", type: "SALES", name: "Terlalu mahal", productId, fixedAmount: "200000", effectiveFrom: new Date() })).rejects.toThrow(/antara/);
  });
});
