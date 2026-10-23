import "server-only";
import { z } from "zod";
import type { Actor } from "../rbac";
import { requireAgent } from "../rbac";
import { AppError, invalid } from "../errors";
import { prisma } from "../db";
import { toRupiah } from "@/lib/money";
import { parseRange } from "@/lib/range";
import { parseDateOnly } from "@/lib/time";
import { authenticateApiKey, receiveWebhook, requireScope } from "../modules/integrations";
import { ingestSettlements, ingestTransactions, runReconciliation } from "../modules/transactions";
import { registerAgent, reviewKyc, setAgentStatus } from "../modules/agents";
import { sendOtp } from "../auth/otp";
import { normalizePhone } from "@/lib/utils";
import { listCatalog, upsertProduct } from "../modules/products";
import { referralNetwork } from "../modules/referrals";
import { agentLeadTransition, activateDevice, assignDevice, createLead, getLeadDetail, refundOrder, reviewLead, submitPayment, verifyPayment } from "../modules/merchants";
import { explainCommission, releaseCommissions, reverseCommission } from "../modules/commissions";
import { approvePayoutBatch, cancelWithdrawal, confirmPayoutTransfer, createPayoutBatch, failPayoutAttempt, recordPayoutTransfer, requestWithdrawal, reviewWithdrawal } from "../modules/withdrawals";
import { listNotifications, markNotificationsRead } from "../modules/notifications";
import { adminDashboard, agentDashboard } from "../modules/reports";
import { requirePermission } from "../rbac";

export type Auth = "public" | "session" | "apiKey" | "webhook";

export interface RouteCtx {
  req: Request;
  params: Record<string, string>;
  actor: Actor;
  query: URLSearchParams;
  body: () => Promise<Record<string, unknown>>;
}

export interface Route {
  method: "GET" | "POST" | "PATCH";
  path: string; // e.g. /merchant-leads/:id/review
  auth: Auth;
  summary: string;
  handler: (ctx: RouteCtx) => Promise<unknown>;
  status?: number;
}

const str = (v: unknown, name: string) => {
  if (typeof v !== "string" || !v.trim()) throw invalid(`${name} wajib diisi.`);
  return v;
};
const money = (v: unknown, name: string) => {
  try {
    return toRupiah(v as string | number);
  } catch {
    throw invalid(`${name} harus bilangan bulat Rupiah.`);
  }
};

export const routes: Route[] = [
  // ── Public ──
  { method: "POST", path: "/auth/registration-otp", auth: "public", summary: "Request registration OTP for a phone number", handler: async ({ body, req }) => {
    const b = await body();
    const phone = normalizePhone(str(b.phone, "phone"));
    if (!phone) throw invalid("Nomor ponsel tidak valid.");
    const r = await sendOtp("REGISTRATION", phone, { ip: req.headers.get("x-forwarded-for")?.split(",")[0] ?? null });
    return { challengeId: r.challengeId, expiresAt: r.expiresAt, mockCode: r.mockCode ?? null };
  } },
  { method: "POST", path: "/agents/register", auth: "public", status: 201, summary: "Self-register as an agent (requires OTP)", handler: async ({ body, req }) =>
    registerAgent((await body()) as never, { ip: req.headers.get("x-forwarded-for")?.split(",")[0] ?? null, userAgent: req.headers.get("user-agent") }) },
  { method: "GET", path: "/products", auth: "public", summary: "Active product catalog with current price and sales commission", handler: async () =>
    (await listCatalog({ activeOnly: true })).map((p) => ({ id: p.id, sku: p.sku, name: p.name, category: p.category, description: p.description, specs: p.specs, imageUrl: p.imageUrl, price: p.price, salesCommission: p.commission, isDemo: p.isDemo })) },

  // ── Session (portal users) ──
  { method: "GET", path: "/me", auth: "session", summary: "Current user and roles", handler: async ({ actor }) => ({ userId: actor.userId, roles: actor.roles, agentId: actor.agentId ?? null, merchantId: actor.merchantId ?? null }) },
  { method: "POST", path: "/products", auth: "session", status: 201, summary: "Create product", handler: async ({ actor, body }) => upsertProduct(actor, null, (await body()) as never) },
  { method: "PATCH", path: "/products/:id", auth: "session", summary: "Update product", handler: async ({ actor, body, params }) => upsertProduct(actor, params.id, (await body()) as never) },
  { method: "GET", path: "/agents", auth: "session", summary: "List agents (admin)", handler: async ({ actor, query }) => {
    requirePermission(actor, "agent.view");
    return prisma.agent.findMany({ where: query.get("status") ? { status: query.get("status") as never } : {}, select: { id: true, agentCode: true, fullName: true, status: true, city: true, province: true, referralCode: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: Math.min(Number(query.get("limit") ?? 100), 1000) });
  } },
  { method: "POST", path: "/agents/:id/status", auth: "session", summary: "Approve / reject / suspend / reactivate an agent", handler: async ({ actor, body, params }) => {
    const b = await body();
    await setAgentStatus(actor, params.id, str(b.status, "status") as never, b.reason as string | undefined);
    return { ok: true };
  } },
  { method: "POST", path: "/agents/:id/kyc-review", auth: "session", summary: "Verify or reject KYC", handler: async ({ actor, body, params }) => {
    const b = await body();
    await reviewKyc(actor, params.id, str(b.decision, "decision") as never, b.reason as string | undefined);
    return { ok: true };
  } },
  { method: "GET", path: "/referrals/network", auth: "session", summary: "Own referral network (direct recruits + informational deeper levels)", handler: async ({ actor, query }) => referralNetwork(actor, query.get("agentId") ?? requireAgent(actor), 3) },
  { method: "POST", path: "/merchant-leads", auth: "session", status: 201, summary: "Create merchant lead (agent)", handler: async ({ actor, body }) => createLead(actor, (await body()) as never) },
  { method: "GET", path: "/merchant-leads", auth: "session", summary: "List merchant leads (own for agents, all for admins)", handler: async ({ actor }) => {
    const where = actor.agentId ? { agentId: actor.agentId } : (requirePermission(actor, "merchant.view"), {});
    return prisma.merchantLead.findMany({ where: { ...where, deletedAt: null }, orderBy: { createdAt: "desc" }, take: 500, select: { id: true, leadNumber: true, businessName: true, status: true, merchantId: true, productId: true, createdAt: true } });
  } },
  { method: "GET", path: "/merchant-leads/:id", auth: "session", summary: "Lead detail with documents and orders (object-level authorized)", handler: async ({ actor, params }) => getLeadDetail(actor, params.id) },
  { method: "POST", path: "/merchant-leads/:id/transition", auth: "session", summary: "Agent transition: contacted | submit | cancel", handler: async ({ actor, body, params }) => agentLeadTransition(actor, params.id, str((await body()).action, "action") as never) },
  { method: "POST", path: "/merchant-leads/:id/review", auth: "session", summary: "Operations review: start_review | request_revision | reject | approve", handler: async ({ actor, body, params }) => {
    const b = await body();
    return reviewLead(actor, params.id, str(b.decision, "decision") as never, b.note as string | undefined);
  } },
  { method: "POST", path: "/orders/:id/payments", auth: "session", status: 201, summary: "Submit payment for an order", handler: async ({ actor, body, params }) => {
    const b = await body();
    return submitPayment(actor, params.id, { amount: money(b.amount, "amount"), method: str(b.method, "method") as never, reference: str(b.reference, "reference"), payerName: b.payerName as string | undefined });
  } },
  { method: "POST", path: "/payments/:id/verify", auth: "session", summary: "Verify or reject a payment", handler: async ({ actor, body, params }) => {
    await verifyPayment(actor, params.id, str((await body()).decision, "decision") as never);
    return { ok: true };
  } },
  { method: "POST", path: "/orders/:id/assign-device", auth: "session", summary: "Assign an in-stock device to a paid order", handler: async ({ actor, body, params }) => {
    await assignDevice(actor, params.id, str((await body()).deviceId, "deviceId"));
    return { ok: true };
  } },
  { method: "POST", path: "/orders/:id/activate", auth: "session", summary: "Activate device (accrues the sales commission)", handler: async ({ actor, body, params }) => {
    const b = await body();
    return activateDevice(actor, params.id, { terminalId: str(b.terminalId, "terminalId"), activatedAt: b.activatedAt ? new Date(String(b.activatedAt)) : undefined });
  } },
  { method: "POST", path: "/orders/:id/refund", auth: "session", summary: "Refund order (reverses / claws back commission)", handler: async ({ actor, body, params }) => {
    await refundOrder(actor, params.id, str((await body()).reason, "reason"));
    return { ok: true };
  } },
  { method: "GET", path: "/commissions", auth: "session", summary: "Commission events (own for agents; all for admins)", handler: async ({ actor, query }) => {
    const range = parseRange({ from: query.get("from") ?? undefined, to: query.get("to") ?? undefined }, 30);
    const own = actor.agentId && actor.roles.includes("AGENT");
    if (!own) requirePermission(actor, "commission.view");
    return prisma.commissionEvent.findMany({
      where: { ...(own ? { agentId: actor.agentId! } : {}), businessDate: { gte: parseDateOnly(range.from), lte: parseDateOnly(range.to) }, ...(query.get("status") ? { status: query.get("status") as never } : {}), ...(query.get("type") ? { type: query.get("type") as never } : {}) },
      select: { id: true, eventRef: true, type: true, status: true, agentId: true, amount: true, deductedAmount: true, ruleCode: true, ruleVersion: true, businessDate: true, holdUntil: true, isDemo: true },
      orderBy: { createdAt: "desc" }, take: Math.min(Number(query.get("limit") ?? 500), 5000),
    });
  } },
  { method: "GET", path: "/commissions/:id", auth: "session", summary: "Explain a commission: source, rate, beneficiary, rule version, ledger", handler: async ({ actor, params }) => explainCommission(actor, params.id) },
  { method: "POST", path: "/commissions/release", auth: "session", summary: "Run the commission release cycle now", handler: async ({ actor }) => releaseCommissions(actor) },
  { method: "POST", path: "/commissions/:id/reverse", auth: "session", summary: "Reverse / claw back a commission", handler: async ({ actor, body, params }) => ({ reversed: await reverseCommission(actor, params.id, str((await body()).reason, "reason")) }) },
  { method: "GET", path: "/wallet", auth: "session", summary: "Own wallet balances (agent)", handler: async ({ actor }) => prisma.wallet.findUniqueOrThrow({ where: { agentId: requireAgent(actor) } }) },
  { method: "GET", path: "/withdrawals", auth: "session", summary: "Withdrawals (own for agents; all for finance)", handler: async ({ actor }) => {
    const own = actor.agentId && actor.roles.includes("AGENT");
    if (!own) requirePermission(actor, "withdrawal.review");
    return prisma.withdrawalRequest.findMany({ where: own ? { agentId: actor.agentId! } : {}, orderBy: { requestedAt: "desc" }, take: 500 });
  } },
  { method: "POST", path: "/withdrawals", auth: "session", status: 201, summary: "Request a withdrawal (idempotency key required)", handler: async ({ actor, body, req }) => {
    const b = await body();
    const key = req.headers.get("idempotency-key") ?? (b.idempotencyKey as string | undefined);
    return requestWithdrawal(actor, { amount: money(b.amount, "amount"), idempotencyKey: str(key, "Idempotency-Key") });
  } },
  { method: "POST", path: "/withdrawals/:id/cancel", auth: "session", summary: "Cancel own withdrawal before review", handler: async ({ actor, params }) => (await cancelWithdrawal(actor, params.id), { ok: true }) },
  { method: "POST", path: "/withdrawals/:id/review", auth: "session", summary: "Approve or reject a withdrawal (finance)", handler: async ({ actor, body, params }) => {
    const b = await body();
    await reviewWithdrawal(actor, params.id, str(b.decision, "decision") as never, b.reason as string | undefined);
    return { ok: true };
  } },
  { method: "POST", path: "/payout-batches", auth: "session", status: 201, summary: "Create payout batch from approved withdrawals (maker)", handler: async ({ actor, body }) => {
    const b = await body();
    if (!Array.isArray(b.withdrawalIds)) throw invalid("withdrawalIds harus array.");
    return createPayoutBatch(actor, b.withdrawalIds as string[], b.note as string | undefined);
  } },
  { method: "POST", path: "/payout-batches/:id/approve", auth: "session", summary: "Approve payout batch (checker ≠ maker)", handler: async ({ actor, params }) => (await approvePayoutBatch(actor, params.id), { ok: true }) },
  { method: "POST", path: "/payout-attempts/:id/record", auth: "session", summary: "Record manual bank transfer (reference)", handler: async ({ actor, body, params }) => (await recordPayoutTransfer(actor, params.id, { providerReference: str((await body()).providerReference, "providerReference") }), { ok: true }) },
  { method: "POST", path: "/payout-attempts/:id/confirm", auth: "session", summary: "Confirm transfer against bank statement (≠ recorder) → PAID", handler: async ({ actor, params }) => (await confirmPayoutTransfer(actor, params.id), { ok: true }) },
  { method: "POST", path: "/payout-attempts/:id/fail", auth: "session", summary: "Mark payout attempt failed", handler: async ({ actor, body, params }) => (await failPayoutAttempt(actor, params.id, str((await body()).reason, "reason")), { ok: true }) },
  { method: "POST", path: "/reconciliation/runs", auth: "session", status: 201, summary: "Run reconciliation up to a business date", handler: async ({ actor, body }) => runReconciliation(actor, str((await body()).date, "date")) },
  { method: "GET", path: "/notifications", auth: "session", summary: "Own in-app notifications", handler: async ({ actor }) => listNotifications(actor, 100) },
  { method: "POST", path: "/notifications/read", auth: "session", summary: "Mark own notifications read", handler: async ({ actor, body }) => {
    const b = await body();
    await markNotificationsRead(actor, Array.isArray(b.ids) ? (b.ids as string[]) : undefined);
    return { ok: true };
  } },
  { method: "GET", path: "/reports/agent-dashboard", auth: "session", summary: "Agent dashboard metrics", handler: async ({ actor, query }) => agentDashboard(actor, parseRange({ from: query.get("from") ?? undefined, to: query.get("to") ?? undefined })) },
  { method: "GET", path: "/reports/admin-dashboard", auth: "session", summary: "Admin dashboard metrics", handler: async ({ actor, query }) => adminDashboard(actor, parseRange({ from: query.get("from") ?? undefined, to: query.get("to") ?? undefined })) },

  // ── Partner integrations (X-Api-Key) ──
  { method: "POST", path: "/transactions", auth: "apiKey", summary: "Ingest transactions (idempotent by source + externalId)", handler: async ({ actor, body }) => {
    requireScope(actor, "transactions:write", (await prisma.apiClient.findUnique({ where: { id: actor.apiClientId! } }))?.scopes);
    const b = await body();
    const items = z.array(z.unknown()).min(1).max(5000).parse(b.transactions);
    return { results: await ingestTransactions(actor, actor.apiSource!, items, "API") };
  } },
  { method: "POST", path: "/settlements", auth: "apiKey", summary: "Ingest settlement reports", handler: async ({ actor, body }) => {
    requireScope(actor, "settlements:write", (await prisma.apiClient.findUnique({ where: { id: actor.apiClientId! } }))?.scopes);
    const b = await body();
    return { results: await ingestSettlements(actor, actor.apiSource!, z.array(z.unknown()).min(1).max(5000).parse(b.settlements)) };
  } },
  { method: "POST", path: "/webhooks/transactions", auth: "webhook", status: 202, summary: "Signed webhook (HMAC-SHA256), async processing with retries + dead letter", handler: async () => {
    throw new AppError("BUSINESS_RULE", "handled in route");
  } },
];

export function match(method: string, path: string): { route: Route; params: Record<string, string> } | null {
  for (const route of routes) {
    if (route.method !== method) continue;
    const a = route.path.split("/").filter(Boolean);
    const b = path.split("/").filter(Boolean);
    if (a.length !== b.length) continue;
    const params: Record<string, string> = {};
    let ok = true;
    for (let i = 0; i < a.length; i++) {
      if (a[i].startsWith(":")) params[a[i].slice(1)] = decodeURIComponent(b[i]);
      else if (a[i] !== b[i]) { ok = false; break; }
    }
    if (ok) return { route, params };
  }
  return null;
}

export { authenticateApiKey, receiveWebhook };
