import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { addDevices, LEAD, makeAdmin, makeAgent, makeProduct, makeRule, release, resetDb, wallet } from "../support/fixtures";
import { onboardAndActivate } from "../support/flows";
import { createLead, getLeadDetail, reviewLead, refundOrder } from "@/server/modules/merchants";
import { explainCommission } from "@/server/modules/commissions";
import { agentDashboard, adminDashboard, exportRows } from "@/server/modules/reports";
import { setAgentStatus, reviewKyc } from "@/server/modules/agents";
import { approvePayoutBatch } from "@/server/modules/withdrawals";
import { ingestSettlements, ingestTransactions, runReconciliation, transactionsForMerchant } from "@/server/modules/transactions";
import { commitImport, createImport } from "@/server/modules/imports";
import { createApiClient, processWebhookEvent, receiveWebhook, signWebhook } from "@/server/modules/integrations";
import { readFileAuthorized } from "@/server/storage/files";
import { addDays, businessDateString } from "@/lib/time";
import type { Actor } from "@/server/rbac";

let ops: Actor, fin: Actor, sup: Actor, productId: string;
async function base() {
  await resetDb();
  ops = await makeAdmin(["OPERATIONS_ADMIN"], "ops");
  fin = await makeAdmin(["FINANCE_ADMIN"], "fin");
  sup = await makeAdmin(["SUPER_ADMIN"], "sup");
  productId = (await makeProduct()).id;
  await addDevices(productId, ["E1", "E2"]);
  await makeRule({ code: "SALES:P", type: "SALES", productId, fixedAmount: 100_000n });
  await makeRule({ code: "TXN", type: "TRANSACTION_REWARD", fixedAmount: 500n });
}

describe("authorization", () => {
  beforeEach(base);

  it("agents cannot read another agent's leads, documents, commissions or merchants", async () => {
    const a = await makeAgent();
    const b = await makeAgent();
    const ids = await onboardAndActivate(a, ops, { productId, n: 1, serial: "E1", terminalId: "TIDE0001" });
    const doc = await prisma.merchantDocument.findFirstOrThrow({ where: { leadId: ids.leadId } });
    const ev = await prisma.commissionEvent.findFirstOrThrow({ where: { agentId: a.agentId } });
    await expect(getLeadDetail(b, ids.leadId)).rejects.toThrow(/akses/);
    await expect(readFileAuthorized(b, doc.fileId)).rejects.toThrow(/akses/);
    await expect(explainCommission(b, ev.id)).rejects.toThrow(/akses/);
    await expect(transactionsForMerchant(b, ids.merchantId)).rejects.toThrow(/akses/);
    expect((await getLeadDetail(a, ids.leadId)).id).toBe(ids.leadId);
    expect((await explainCommission(a, ev.id)).event.id).toBe(ev.id);
    const dash = await agentDashboard(b, { from: "2020-01-01", to: "2030-01-01" });
    expect(dash.merchants).toHaveLength(0);
  });

  it("agents cannot call admin operations", async () => {
    const a = await makeAgent();
    const lead = await createLead(a, LEAD(productId, 1));
    await expect(reviewLead(a, lead.id, "approve")).rejects.toThrow(/akses/);
    await expect(setAgentStatus(a, a.agentId, "SUSPENDED", "x")).rejects.toThrow(/akses/);
    await expect(adminDashboard(a, { from: "2026-01-01", to: "2026-12-31" })).rejects.toThrow(/akses/);
    await expect(exportRows(a, "agents", { from: "2026-01-01", to: "2026-12-31" })).rejects.toThrow(/akses/);
  });

  it("roles are separated: ops cannot approve payouts; finance cannot review KYC; admin without MFA is denied", async () => {
    const b = await prisma.payoutBatch.create({ data: { totalAmount: 0n, itemCount: 0, createdById: fin.userId! } });
    await expect(approvePayoutBatch(ops, b.id)).rejects.toThrow(/akses/);
    const a = await makeAgent({ status: "PENDING" });
    await expect(reviewKyc(fin, a.agentId, "VERIFIED")).rejects.toThrow(/akses/);
    await expect(adminDashboard({ ...sup, mfaVerified: false }, { from: "2026-01-01", to: "2026-12-31" })).rejects.toThrow(/akses/);
  });

  it("merchants only see their own transactions", async () => {
    const a = await makeAgent();
    const one = await onboardAndActivate(a, ops, { productId, n: 1, serial: "E1", terminalId: "TIDE0001" });
    const two = await onboardAndActivate(a, ops, { productId, n: 2, serial: "E2", terminalId: "TIDE0002" });
    const merchantActor: Actor = { kind: "user", userId: "m-user", roles: ["MERCHANT"], merchantId: one.merchantId };
    await expect(transactionsForMerchant(merchantActor, one.merchantId)).resolves.toBeDefined();
    await expect(transactionsForMerchant(merchantActor, two.merchantId)).rejects.toThrow(/akses/);
  });

  it("pending agents cannot onboard merchants and accrue nothing", async () => {
    const p = await makeAgent({ status: "PENDING" });
    await expect(createLead(p, LEAD(productId, 9))).rejects.toThrow(/belum aktif/);
  });
});

describe("transaction reward eligibility", () => {
  beforeEach(base);

  it("never rewards failed, pending, test, excluded, unmatched or unsettled transactions", async () => {
    const a = await makeAgent();
    await onboardAndActivate(a, ops, { productId, n: 1, serial: "E1", terminalId: "TIDE0001" });
    const ts = new Date().toISOString();
    const day = businessDateString(new Date());
    await ingestTransactions(fin, "PARTNER_A", [
      { externalId: "OK", terminalId: "TIDE0001", status: "SUCCESS", amount: 1000, occurredAt: ts, settlementRef: "S1" },
      { externalId: "FAIL", terminalId: "TIDE0001", status: "FAILED", amount: 1000, occurredAt: ts, settlementRef: "S1" },
      { externalId: "PEND", terminalId: "TIDE0001", status: "PENDING", amount: 1000, occurredAt: ts },
      { externalId: "TEST", terminalId: "TIDE0001", status: "SUCCESS", amount: 1000, occurredAt: ts, settlementRef: "S1", isTest: true },
      { externalId: "REFUND", terminalId: "TIDE0001", status: "SUCCESS", amount: 1000, occurredAt: ts, settlementRef: "S1", type: "REFUND" },
      { externalId: "UNMATCHED", terminalId: "TIDZ9999", status: "SUCCESS", amount: 1000, occurredAt: ts, settlementRef: "S1" },
      { externalId: "NOSETTLE", terminalId: "TIDE0001", status: "SUCCESS", amount: 1000, occurredAt: ts, settlementRef: "S2" },
    ], "API");
    // S1 SUCCESS rows: OK, TEST, REFUND, UNMATCHED = 4 × 1000
    await ingestSettlements(fin, "PARTNER_A", [{ settlementRef: "S1", settlementDate: day, expectedCount: 4, expectedAmount: 4000 }]);
    await runReconciliation(ops, day);
    const rewarded = await prisma.transaction.findMany({ where: { rewardStatus: "REWARDED" } });
    expect(rewarded.map((t) => t.externalId)).toEqual(["OK"]);
    const byId = Object.fromEntries((await prisma.transaction.findMany()).map((t) => [t.externalId, t]));
    expect(byId.NOSETTLE.rewardStatus).toBe("AWAITING_SETTLEMENT");
    expect(byId.UNMATCHED.matchStatus).toBe("UNMATCHED");
    expect(await prisma.reconciliationException.count({ where: { type: "UNMATCHED_TERMINAL" } })).toBe(1);
  });

  it("holds rewards for a settlement whose totals do not match until accepted", async () => {
    const a = await makeAgent();
    await onboardAndActivate(a, ops, { productId, n: 1, serial: "E1", terminalId: "TIDE0001" });
    const day = businessDateString(new Date());
    await ingestTransactions(fin, "PARTNER_A", [{ externalId: "M1", terminalId: "TIDE0001", status: "SUCCESS", amount: 1000, occurredAt: new Date().toISOString(), settlementRef: "SM" }], "API");
    await ingestSettlements(fin, "PARTNER_A", [{ settlementRef: "SM", settlementDate: day, expectedCount: 2, expectedAmount: 2000 }]);
    await runReconciliation(ops, day);
    expect(await prisma.commissionEvent.count({ where: { type: "TRANSACTION_REWARD" } })).toBe(0);
    expect((await prisma.settlement.findFirstOrThrow()).status).toBe("MISMATCH");
  });

  it("does not reward transactions before the device was activated, or after a refund", async () => {
    const a = await makeAgent();
    const ids = await onboardAndActivate(a, ops, { productId, n: 1, serial: "E1", terminalId: "TIDE0001" });
    const day = businessDateString(new Date());
    await ingestTransactions(fin, "PARTNER_A", [{ externalId: "EARLY", terminalId: "TIDE0001", status: "SUCCESS", amount: 1000, occurredAt: addDays(new Date(), -3).toISOString(), settlementRef: "SE" }], "API");
    await ingestSettlements(fin, "PARTNER_A", [{ settlementRef: "SE", settlementDate: day, expectedCount: 1, expectedAmount: 1000 }]);
    await runReconciliation(ops, day);
    expect((await prisma.transaction.findFirstOrThrow({ where: { externalId: "EARLY" } })).ineligibleReason).toBe("DEVICE_NOT_ACTIVE_AT_TIME");
    await refundOrder(fin, ids.orderId, "Refund test");
    await ingestTransactions(fin, "PARTNER_A", [{ externalId: "AFTER", terminalId: "TIDE0001", status: "SUCCESS", amount: 1000, occurredAt: new Date().toISOString(), settlementRef: "SE" }], "API");
    expect((await prisma.transaction.findFirstOrThrow({ where: { externalId: "AFTER" } })).matchStatus).toBe("UNMATCHED");
    expect((await wallet(a.agentId)).pendingBalance).toBe(0n);
  });
});

describe("imports", () => {
  beforeEach(base);

  const csv = (rows: string[]) => ({ buffer: Buffer.from(["transaction_id,terminal_id,status,amount,timestamp,settlement_ref", ...rows].join("\n")), filename: "trx.csv" });

  it("previews, deduplicates, commits idempotently and supports safe re-import", async () => {
    const a = await makeAgent();
    await onboardAndActivate(a, ops, { productId, n: 1, serial: "E1", terminalId: "TIDE0001" });
    const now = new Date().toISOString();
    const file = csv([`I-1,TIDE0001,SUCCESS,1000,${now},SI`, `I-2,TIDE0001,SUCCESS,2000,${now},SI`, `I-2,TIDE0001,SUCCESS,2000,${now},SI`, `I-3,bad,???,1.5,nope,`]);
    const imp = await createImport(ops, { type: "TRANSACTIONS", source: "PARTNER_A", file });
    expect(imp).toMatchObject({ totalRows: 4, validRows: 2, invalidRows: 1, duplicateRows: 1, status: "VALIDATED" });
    expect(await prisma.transaction.count()).toBe(0); // preview only
    const done = await commitImport(ops, imp.id);
    expect(done).toMatchObject({ status: "COMMITTED", importedRows: 2 });
    expect(done.errorReportFileId).not.toBeNull();
    await expect(commitImport(ops, imp.id)).rejects.toThrow(/sudah diterapkan|diproses/);
    const again = await createImport(ops, { type: "TRANSACTIONS", source: "PARTNER_A", file });
    expect(again.previousImportId).toBe(imp.id);
    expect(again.validRows).toBe(0);
    expect(again.duplicateRows).toBe(3);
    expect(await prisma.transaction.count()).toBe(2);
  });

  it("retrying a failed commit never double-applies rows", async () => {
    const a = await makeAgent();
    await onboardAndActivate(a, ops, { productId, n: 1, serial: "E1", terminalId: "TIDE0001" });
    const now = new Date().toISOString();
    const imp = await createImport(ops, { type: "TRANSACTIONS", source: "PARTNER_A", file: csv([`R-1,TIDE0001,SUCCESS,1000,${now},SR`, `R-2,TIDE0001,SUCCESS,1000,${now},SR`]) });
    // Simulate a crash after the first row was applied
    await ingestTransactions(ops, "PARTNER_A", [{ externalId: "R-1", terminalId: "TIDE0001", status: "SUCCESS", amount: 1000, occurredAt: now, settlementRef: "SR" }], "IMPORT", { importId: imp.id });
    await prisma.transactionImport.update({ where: { id: imp.id }, data: { status: "FAILED" } });
    const done = await commitImport(ops, imp.id);
    expect(done.importedRows).toBe(1);
    expect(done.duplicateRows).toBe(1);
    expect(await prisma.transaction.count()).toBe(2);
  });

  it("imports devices and merchant leads with validation", async () => {
    const dev = await createImport(ops, { type: "DEVICES", file: { buffer: Buffer.from("serial_number,product_sku\nNEW-0001,A920PRO\nNEW-0001,A920PRO\nX,NOPE\n"), filename: "dev.csv" } });
    expect(dev).toMatchObject({ validRows: 1, duplicateRows: 1, invalidRows: 1 });
    await commitImport(ops, dev.id);
    expect(await prisma.device.count({ where: { serialNumber: "NEW-0001" } })).toBe(1);
    const a = await makeAgent();
    const ag = await prisma.agent.findUniqueOrThrow({ where: { id: a.agentId } });
    const leads = await createImport(ops, { type: "MERCHANT_LEADS", file: { buffer: Buffer.from(`agent_code,business_name,owner_name,phone,business_type,address,city,province,product_sku\n${ag.agentCode},Toko Impor,Ibu Ani,081299998888,Warung,Jl. Impor 1,Bogor,Jawa Barat,A920PRO\n`), filename: "leads.csv" } });
    expect(leads.validRows).toBe(1);
    await commitImport(ops, leads.id);
    expect(await prisma.merchantLead.count({ where: { agentId: a.agentId } })).toBe(1);
  });
});

describe("webhooks", () => {
  beforeEach(base);

  it("verifies signatures, rejects stale timestamps and is idempotent by event id", async () => {
    const { apiKey, webhookSecret } = await createApiClient(sup, { name: "P", partnerSource: "PARTNER_A", scopes: ["transactions:write"] });
    const body = JSON.stringify({ type: "transactions", data: [{ externalId: "W1", terminalId: "TIDE0001", status: "SUCCESS", amount: 1000, occurredAt: new Date().toISOString() }] });
    const ts = String(Math.floor(Date.now() / 1000));
    const ok = { apiKey, timestamp: ts, signature: signWebhook(webhookSecret, ts, body), eventId: "evt-1" };
    await expect(receiveWebhook({ ...ok, signature: "sha256=00" }, body)).rejects.toThrow(/tanda tangan/i);
    await expect(receiveWebhook({ ...ok, timestamp: String(Number(ts) - 3600) }, body)).rejects.toThrow(/Timestamp/);
    await expect(receiveWebhook({ ...ok, apiKey: "hj_wrong" }, body)).rejects.toThrow(/API key/);
    const first = await receiveWebhook(ok, body);
    const second = await receiveWebhook(ok, body);
    expect(first.duplicate).toBe(false);
    expect(second).toMatchObject({ duplicate: true, id: first.id });
    expect(await prisma.job.count({ where: { type: "webhook.process" } })).toBe(1);
    const client = await prisma.apiClient.findFirstOrThrow();
    await processWebhookEvent(first.id, client.id, 1, 6);
    expect((await prisma.webhookEvent.findUniqueOrThrow({ where: { id: first.id } })).status).toBe("PROCESSED");
    expect(await prisma.transaction.count({ where: { externalId: "W1", ingestChannel: "WEBHOOK" } })).toBe(1);
  });

  it("dead-letters an event after the final failed attempt", async () => {
    await createApiClient(sup, { name: "P", partnerSource: "PARTNER_A", scopes: [] });
    const client = await prisma.apiClient.findFirstOrThrow();
    const ev = await prisma.webhookEvent.create({ data: { provider: "PARTNER_A", externalEventId: "evt-bad", eventType: "transactions", signatureValid: true, payload: { type: "transactions", data: "not-an-array" } } });
    await expect(processWebhookEvent(ev.id, client.id, 1, 3)).rejects.toThrow();
    expect((await prisma.webhookEvent.findUniqueOrThrow({ where: { id: ev.id } })).status).toBe("FAILED");
    await processWebhookEvent(ev.id, client.id, 3, 3);
    expect((await prisma.webhookEvent.findUniqueOrThrow({ where: { id: ev.id } })).status).toBe("DEAD_LETTER");
  });

  it("API keys can only write their own source", async () => {
    const { apiKey } = await createApiClient(sup, { name: "P", partnerSource: "PARTNER_A", scopes: [] });
    const { authenticateApiKey } = await import("@/server/modules/integrations");
    const actor = await authenticateApiKey(apiKey);
    await expect(ingestTransactions(actor, "PARTNER_B", [], "API")).rejects.toThrow(/sumber/);
  });
});

describe("refund after payout is reflected in release", () => {
  beforeEach(base);
  it("refunding inside the hold window just cancels the pending commission", async () => {
    await prisma.commissionRule.updateMany({ where: { type: "SALES" }, data: { holdDays: 7 } });
    const a = await makeAgent();
    const ids = await onboardAndActivate(a, ops, { productId, n: 1, serial: "E1", terminalId: "TIDE0001" });
    await refundOrder(fin, ids.orderId, "Customer cancelled");
    await release(addDays(new Date(), 10));
    expect(await wallet(a.agentId)).toMatchObject({ pendingBalance: 0n, payableBalance: 0n, receivableBalance: 0n });
  });
});
