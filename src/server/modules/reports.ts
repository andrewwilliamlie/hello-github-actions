import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { requireAgent, requirePermission, type Actor } from "../rbac";
import { parseDateOnly } from "@/lib/time";

export interface DateRange { from: string; to: string } // inclusive Jakarta business dates

const d = (s: string) => parseDateOnly(s);

export interface AgentFilters extends DateRange { merchantId?: string; productId?: string; source?: string }

/** Agent dashboard. Strictly scoped to the calling agent. */
export async function agentDashboard(actor: Actor, f: AgentFilters) {
  const agentId = requireAgent(actor);
  const from = d(f.from);
  const to = d(f.to);
  const typeFilter = f.source ? Prisma.sql`AND "type" = ${f.source}::"CommissionType"` : Prisma.empty;
  const merchantFilter = f.merchantId ? Prisma.sql`AND "merchantId" = ${f.merchantId}` : Prisma.empty;
  const productFilter = f.productId ? Prisma.sql`AND "productId" = ${f.productId}` : Prisma.empty;

  const [wallet, byType, trend, txTrend, merchants, recruits, directSales, recent, activeMerchantCount] = await Promise.all([
    prisma.wallet.findUniqueOrThrow({ where: { agentId } }),
    prisma.$queryRaw<{ type: string; total: bigint; n: bigint }[]>`
      SELECT "type", COALESCE(SUM("amount" - "deductedAmount"),0)::bigint AS total, COUNT(*)::bigint AS n FROM "CommissionEvent"
      WHERE "agentId" = ${agentId} AND "status" <> 'REVERSED' AND "businessDate" BETWEEN ${from} AND ${to} ${typeFilter} ${merchantFilter} ${productFilter}
      GROUP BY "type"`,
    prisma.$queryRaw<{ day: Date; type: string; total: bigint }[]>`
      SELECT "businessDate" AS day, "type", COALESCE(SUM("amount" - "deductedAmount"),0)::bigint AS total FROM "CommissionEvent"
      WHERE "agentId" = ${agentId} AND "status" <> 'REVERSED' AND "businessDate" BETWEEN ${from} AND ${to} ${typeFilter} ${merchantFilter} ${productFilter}
      GROUP BY 1, 2 ORDER BY 1`,
    prisma.$queryRaw<{ day: Date; n: bigint; eligible: bigint }[]>`
      SELECT t."businessDate" AS day, COUNT(*)::bigint AS n, COUNT(*) FILTER (WHERE t."rewardStatus" = 'REWARDED')::bigint AS eligible
      FROM "Transaction" t JOIN "MerchantAttribution" a ON a."merchantId" = t."merchantId" AND a."agentId" = ${agentId}
        AND a."effectiveFrom" <= t."occurredAt" AND (a."effectiveTo" IS NULL OR a."effectiveTo" > t."occurredAt")
      WHERE t."businessDate" BETWEEN ${from} AND ${to} AND t."status" = 'SUCCESS' ${f.merchantId ? Prisma.sql`AND t."merchantId" = ${f.merchantId}` : Prisma.empty}
      GROUP BY 1 ORDER BY 1`,
    prisma.$queryRaw<{ merchantId: string; merchantCode: string; businessName: string; txns: bigint; eligible: bigint; earnings: bigint }[]>`
      SELECT m."id" AS "merchantId", m."merchantCode", m."businessName",
        (SELECT COUNT(*) FROM "Transaction" t WHERE t."merchantId" = m."id" AND t."status"='SUCCESS' AND t."businessDate" BETWEEN ${from} AND ${to})::bigint AS txns,
        (SELECT COUNT(*) FROM "Transaction" t WHERE t."merchantId" = m."id" AND t."rewardStatus"='REWARDED' AND t."businessDate" BETWEEN ${from} AND ${to})::bigint AS eligible,
        (SELECT COALESCE(SUM(e."amount"-e."deductedAmount"),0) FROM "CommissionEvent" e WHERE e."merchantId" = m."id" AND e."agentId" = ${agentId} AND e."status" <> 'REVERSED' AND e."businessDate" BETWEEN ${from} AND ${to})::bigint AS earnings
      FROM "Merchant" m JOIN "MerchantAttribution" a ON a."merchantId" = m."id" AND a."agentId" = ${agentId} AND a."effectiveTo" IS NULL
      WHERE m."deletedAt" IS NULL ORDER BY earnings DESC, txns DESC LIMIT 10`,
    prisma.agentReferral.count({ where: { referrerAgentId: agentId, endedAt: null, status: "APPROVED", recruit: { status: "ACTIVE" } } }),
    prisma.salesOrder.count({ where: { sellingAgentId: agentId, status: "ACTIVATED", activation: { activatedAt: { gte: from, lt: new Date(to.getTime() + 86_400_000 + 7 * 3600_000) } } } }),
    prisma.commissionEvent.findMany({ where: { agentId }, orderBy: { createdAt: "desc" }, take: 8, select: { id: true, eventRef: true, type: true, status: true, amount: true, deductedAmount: true, createdAt: true, merchantId: true } }),
    prisma.merchantAttribution.count({ where: { agentId, effectiveTo: null, merchant: { status: { in: ["ACTIVATED", "COMMISSION_ELIGIBLE"] } } } }),
  ]);

  const sum = (types: string[]) => byType.filter((r) => types.includes(r.type)).reduce((s, r) => s + r.total, 0n);
  return {
    wallet,
    totals: {
      totalEarnings: sum(["SALES", "TRANSACTION_REWARD", "REFERRAL_SALES", "REFERRAL_TRANSACTION", "ADJUSTMENT"]),
      salesCommission: sum(["SALES"]),
      recurringRewards: sum(["TRANSACTION_REWARD"]),
      referralRewards: sum(["REFERRAL_SALES", "REFERRAL_TRANSACTION"]),
      directSales,
      activeMerchants: activeMerchantCount,
      merchantTransactions: txTrend.reduce((s, r) => s + Number(r.n), 0),
      eligibleTransactions: txTrend.reduce((s, r) => s + Number(r.eligible), 0),
      activeRecruits: recruits,
    },
    trend: trend.map((r) => ({ day: r.day.toISOString().slice(0, 10), type: r.type, total: Number(r.total) })),
    txTrend: txTrend.map((r) => ({ day: r.day.toISOString().slice(0, 10), n: Number(r.n), eligible: Number(r.eligible) })),
    merchants: merchants.map((m) => ({ ...m, txns: Number(m.txns), eligible: Number(m.eligible), earnings: Number(m.earnings) })),
    recent,
  };
}

/** Admin analytics. */
export async function adminDashboard(actor: Actor, r: DateRange) {
  requirePermission(actor, "report.view");
  const from = d(r.from);
  const to = d(r.to);
  const toEnd = new Date(to.getTime() + 86_400_000 - 7 * 3600_000);
  const fromStart = new Date(from.getTime() - 7 * 3600_000);
  const [
    agentsByStatus, newAgents, recruitTrend, merchantsByStatus, activatedDevices, productPerf, eligibleTxns, liabilities, openWithdrawals,
    fraudOpen, lastRun, openExceptions, topAgents, geo, cohorts, leadFunnel, demoRules,
  ] = await Promise.all([
    prisma.agent.groupBy({ by: ["status"], where: { deletedAt: null }, _count: true }),
    prisma.agent.count({ where: { createdAt: { gte: fromStart, lt: toEnd } } }),
    prisma.$queryRaw<{ day: Date; total: bigint; referred: bigint }[]>`
      SELECT date_trunc('day', a."createdAt" AT TIME ZONE 'Asia/Jakarta')::date AS day, COUNT(*)::bigint AS total,
        COUNT(r."id")::bigint AS referred
      FROM "Agent" a LEFT JOIN "AgentReferral" r ON r."recruitAgentId" = a."id" AND r."endedAt" IS NULL
      WHERE a."createdAt" >= ${fromStart} AND a."createdAt" < ${toEnd} GROUP BY 1 ORDER BY 1`,
    prisma.merchant.groupBy({ by: ["status"], where: { deletedAt: null }, _count: true }),
    prisma.device.count({ where: { status: "ACTIVE" } }),
    prisma.$queryRaw<{ name: string; sku: string; sold: bigint; activated: bigint; revenue: bigint; commission: bigint }[]>`
      SELECT p."name", p."sku",
        COUNT(o."id") FILTER (WHERE o."status" <> 'CANCELLED')::bigint AS sold,
        COUNT(o."id") FILTER (WHERE o."status" = 'ACTIVATED')::bigint AS activated,
        COALESCE(SUM(o."totalAmount") FILTER (WHERE o."status" IN ('PAYMENT_VERIFIED','DEVICE_ASSIGNED','ACTIVATED')),0)::bigint AS revenue,
        (SELECT COALESCE(SUM(e."amount"),0) FROM "CommissionEvent" e WHERE e."productId" = p."id" AND e."type" = 'SALES' AND e."status" <> 'REVERSED')::bigint AS commission
      FROM "Product" p LEFT JOIN "SalesOrder" o ON o."productId" = p."id" AND o."createdAt" >= ${fromStart} AND o."createdAt" < ${toEnd}
      WHERE p."deletedAt" IS NULL GROUP BY p."id" ORDER BY sold DESC`,
    prisma.transaction.count({ where: { rewardStatus: "REWARDED", businessDate: { gte: from, lte: to } } }),
    prisma.wallet.aggregate({ _sum: { pendingBalance: true, payableBalance: true, reservedBalance: true, paidTotal: true, receivableBalance: true } }),
    prisma.withdrawalRequest.aggregate({ where: { status: { in: ["REQUESTED", "APPROVED", "IN_BATCH", "PROCESSING", "FAILED"] } }, _sum: { amount: true }, _count: true }),
    prisma.fraudFlag.count({ where: { status: "OPEN" } }),
    prisma.reconciliationRun.findFirst({ orderBy: { startedAt: "desc" } }),
    prisma.reconciliationException.count({ where: { status: "OPEN" } }),
    prisma.$queryRaw<{ id: string; agentCode: string; fullName: string; city: string; total: bigint; sales: bigint; merchants: bigint }[]>`
      SELECT a."id", a."agentCode", a."fullName", a."city",
        COALESCE(SUM(e."amount" - e."deductedAmount") FILTER (WHERE e."status" <> 'REVERSED'),0)::bigint AS total,
        COUNT(e."id") FILTER (WHERE e."type" = 'SALES' AND e."status" <> 'REVERSED')::bigint AS sales,
        (SELECT COUNT(*) FROM "MerchantAttribution" ma WHERE ma."agentId" = a."id" AND ma."effectiveTo" IS NULL)::bigint AS merchants
      FROM "Agent" a LEFT JOIN "CommissionEvent" e ON e."agentId" = a."id" AND e."businessDate" BETWEEN ${from} AND ${to}
      WHERE a."status" = 'ACTIVE' GROUP BY a."id" ORDER BY total DESC LIMIT 10`,
    prisma.$queryRaw<{ province: string; merchants: bigint; active: bigint; txns: bigint }[]>`
      SELECT m."province", COUNT(*)::bigint AS merchants,
        COUNT(*) FILTER (WHERE m."status" IN ('ACTIVATED','COMMISSION_ELIGIBLE'))::bigint AS active,
        (SELECT COUNT(*) FROM "Transaction" t JOIN "Merchant" m2 ON m2."id" = t."merchantId" WHERE m2."province" = m."province" AND t."status"='SUCCESS' AND t."businessDate" BETWEEN ${from} AND ${to})::bigint AS txns
      FROM "Merchant" m WHERE m."deletedAt" IS NULL GROUP BY m."province" ORDER BY merchants DESC LIMIT 12`,
    prisma.$queryRaw<{ cohort: string; agents: bigint; active: bigint; withSale: bigint }[]>`
      SELECT to_char(date_trunc('month', a."createdAt" AT TIME ZONE 'Asia/Jakarta'), 'YYYY-MM') AS cohort, COUNT(*)::bigint AS agents,
        COUNT(*) FILTER (WHERE a."status" = 'ACTIVE')::bigint AS active,
        COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM "SalesOrder" o WHERE o."sellingAgentId" = a."id" AND o."status" = 'ACTIVATED'))::bigint AS "withSale"
      FROM "Agent" a GROUP BY 1 ORDER BY 1 DESC LIMIT 12`,
    prisma.merchantLead.groupBy({ by: ["status"], where: { deletedAt: null }, _count: true }),
    prisma.commissionRule.count({ where: { status: "ACTIVE", isDemo: true } }),
  ]);
  const count = (rows: { status: string; _count: number }[], s: string) => rows.find((x) => x.status === s)?._count ?? 0;
  const merchantTotal = merchantsByStatus.reduce((s, x) => s + x._count, 0);
  const leadsTotal = leadFunnel.reduce((s, x) => s + x._count, 0);
  const funnel = [
    { stage: "LEAD", value: leadsTotal },
    { stage: "APPLICATION_SUBMITTED", value: leadsTotal - count(leadFunnel, "LEAD") - count(leadFunnel, "CONTACTED") - count(leadFunnel, "CANCELLED") },
    { stage: "APPROVED", value: merchantTotal },
    { stage: "PAYMENT_VERIFIED", value: merchantTotal - count(merchantsByStatus, "APPROVED") - count(merchantsByStatus, "CANCELLED") },
    { stage: "ACTIVATED", value: count(merchantsByStatus, "ACTIVATED") + count(merchantsByStatus, "COMMISSION_ELIGIBLE") + count(merchantsByStatus, "SUSPENDED") },
    { stage: "COMMISSION_ELIGIBLE", value: count(merchantsByStatus, "COMMISSION_ELIGIBLE") },
  ];
  return {
    agents: { total: agentsByStatus.reduce((s, x) => s + x._count, 0), active: count(agentsByStatus, "ACTIVE"), pending: count(agentsByStatus, "PENDING"), suspended: count(agentsByStatus, "SUSPENDED"), new: newAgents },
    recruitTrend: recruitTrend.map((x) => ({ day: x.day.toISOString().slice(0, 10), total: Number(x.total), referred: Number(x.referred) })),
    merchants: { total: merchantTotal, byStatus: merchantsByStatus.map((x) => ({ status: x.status, count: x._count })) },
    activatedDevices,
    productPerf: productPerf.map((p) => ({ ...p, sold: Number(p.sold), activated: Number(p.activated), revenue: p.revenue, commission: p.commission })),
    eligibleTxns,
    liabilities: {
      pending: liabilities._sum.pendingBalance ?? 0n, payable: liabilities._sum.payableBalance ?? 0n, reserved: liabilities._sum.reservedBalance ?? 0n,
      receivable: liabilities._sum.receivableBalance ?? 0n, paid: liabilities._sum.paidTotal ?? 0n,
    },
    openWithdrawals: { amount: openWithdrawals._sum.amount ?? 0n, count: openWithdrawals._count },
    fraudOpen,
    reconciliation: { lastRun, openExceptions },
    topAgents: topAgents.map((a) => ({ ...a, total: a.total, sales: Number(a.sales), merchants: Number(a.merchants) })),
    geo: geo.map((g) => ({ province: g.province, merchants: Number(g.merchants), active: Number(g.active), txns: Number(g.txns) })),
    cohorts: cohorts.map((c) => ({ cohort: c.cohort, agents: Number(c.agents), active: Number(c.active), withSale: Number(c.withSale) })),
    funnel,
    demoRules,
  };
}

// ─────────────────────────────── Exports ───────────────────────────────

export type ExportKind = "agents" | "merchants" | "commissions" | "transactions" | "withdrawals";

export async function exportRows(actor: Actor, kind: ExportKind, r: DateRange): Promise<{ columns: string[]; rows: (string | number)[][] }> {
  requirePermission(actor, "report.export");
  const fromStart = new Date(d(r.from).getTime() - 7 * 3600_000);
  const toEnd = new Date(d(r.to).getTime() + 86_400_000 - 7 * 3600_000);
  switch (kind) {
    case "agents": {
      const rows = await prisma.agent.findMany({ include: { wallet: true }, orderBy: { agentNumber: "asc" } });
      return {
        columns: ["agent_code", "name", "status", "city", "province", "referral_code", "registered_at", "pending", "payable", "reserved", "paid_total"],
        rows: rows.map((a) => [a.agentCode, a.fullName, a.status, a.city, a.province, a.referralCode, a.createdAt.toISOString(), String(a.wallet?.pendingBalance ?? 0n), String(a.wallet?.payableBalance ?? 0n), String(a.wallet?.reservedBalance ?? 0n), String(a.wallet?.paidTotal ?? 0n)]),
      };
    }
    case "merchants": {
      const rows = await prisma.merchant.findMany({ include: { attributions: { where: { effectiveTo: null }, include: { agent: true } } }, orderBy: { merchantNumber: "asc" } });
      return {
        columns: ["merchant_code", "business_name", "status", "city", "province", "agent_code", "approved_at"],
        rows: rows.map((m) => [m.merchantCode, m.businessName, m.status, m.city, m.province, m.attributions[0]?.agent.agentCode ?? "", m.approvedAt.toISOString()]),
      };
    }
    case "commissions": {
      const rows = await prisma.commissionEvent.findMany({ where: { createdAt: { gte: fromStart, lt: toEnd } }, include: { agent: true }, orderBy: { createdAt: "asc" } });
      return {
        columns: ["event_ref", "type", "status", "agent_code", "amount", "deducted", "rule", "business_date", "created_at", "is_demo"],
        rows: rows.map((e) => [e.eventRef, e.type, e.status, e.agent.agentCode, String(e.amount), String(e.deductedAmount), `${e.ruleCode} v${e.ruleVersion}`, e.businessDate.toISOString().slice(0, 10), e.createdAt.toISOString(), e.isDemo ? "yes" : "no"]),
      };
    }
    case "transactions": {
      const rows = await prisma.transaction.findMany({ where: { businessDate: { gte: d(r.from), lte: d(r.to) } }, orderBy: { occurredAt: "asc" }, take: 100_000 });
      return {
        columns: ["source", "external_id", "terminal_id", "type", "status", "amount", "occurred_at", "settlement_ref", "match", "reward_status", "reason", "channel"],
        rows: rows.map((t) => [t.source, t.externalId, t.terminalId, t.type, t.status, String(t.amount), t.occurredAt.toISOString(), t.settlementRef ?? "", t.matchStatus, t.rewardStatus, t.ineligibleReason ?? "", t.ingestChannel]),
      };
    }
    case "withdrawals": {
      const rows = await prisma.withdrawalRequest.findMany({ where: { requestedAt: { gte: fromStart, lt: toEnd } }, include: { agent: true, bankAccount: true }, orderBy: { requestedAt: "asc" } });
      return {
        columns: ["withdrawal_no", "agent_code", "amount", "status", "bank", "account_last4", "requested_at", "paid_at"],
        rows: rows.map((w) => [`WD-${w.withdrawalNumber}`, w.agent.agentCode, String(w.amount), w.status, w.bankAccount.bankName, w.bankAccount.accountNumberLast4, w.requestedAt.toISOString(), w.paidAt?.toISOString() ?? ""]),
      };
    }
  }
}

export function toCsv(columns: string[], rows: (string | number)[][]): string {
  const esc = (v: string | number) => {
    const s = String(v);
    // Prevent CSV/formula injection in spreadsheet apps.
    const safe = /^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s) ? `'${s}` : s;
    return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  return [columns.join(","), ...rows.map((r) => r.map(esc).join(","))].join("\n");
}

export async function toXlsx(sheetName: string, columns: string[], rows: (string | number)[][]): Promise<Buffer> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Hausjo Agent Network";
  const ws = wb.addWorksheet(sheetName);
  ws.addRow(columns).font = { bold: true };
  for (const r of rows) ws.addRow(r.map((v) => (typeof v === "string" && /^[=+\-@]/.test(v) && !/^-?\d+$/.test(v) ? `'${v}` : v)));
  ws.columns.forEach((c) => (c.width = 18));
  return Buffer.from(await wb.xlsx.writeBuffer());
}
