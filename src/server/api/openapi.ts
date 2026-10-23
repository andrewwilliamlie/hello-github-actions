import "server-only";
import { routes } from "./router";

const ref = (n: string) => ({ $ref: `#/components/schemas/${n}` });

/** Request body schemas for documented endpoints (others accept the JSON object described in the summary). */
const BODIES: Record<string, object> = {
  "POST /transactions": ref("TransactionIngestRequest"),
  "POST /settlements": ref("SettlementIngestRequest"),
  "POST /webhooks/transactions": ref("WebhookPayload"),
  "POST /withdrawals": { type: "object", required: ["amount"], properties: { amount: { type: "integer", description: "Whole Rupiah" }, idempotencyKey: { type: "string", description: "Or send Idempotency-Key header" } } },
  "POST /merchant-leads": ref("MerchantLeadInput"),
  "POST /agents/register": ref("AgentRegistration"),
  "POST /auth/registration-otp": { type: "object", required: ["phone"], properties: { phone: { type: "string", example: "081234567890" } } },
  "POST /orders/:id/activate": { type: "object", required: ["terminalId"], properties: { terminalId: { type: "string" }, activatedAt: { type: "string", format: "date-time" } } },
  "POST /merchant-leads/:id/review": { type: "object", required: ["decision"], properties: { decision: { enum: ["start_review", "request_revision", "reject", "approve"] }, note: { type: "string" } } },
  "POST /payout-batches": { type: "object", required: ["withdrawalIds"], properties: { withdrawalIds: { type: "array", items: { type: "string" } }, note: { type: "string" } } },
  "POST /reconciliation/runs": { type: "object", required: ["date"], properties: { date: { type: "string", format: "date" } } },
};

export function openApiSpec() {
  const paths: Record<string, Record<string, object>> = {};
  for (const r of routes) {
    const p = r.path.replace(/:(\w+)/g, "{$1}");
    const params = [...r.path.matchAll(/:(\w+)/g)].map((m) => ({ name: m[1], in: "path", required: true, schema: { type: "string" } }));
    const security = r.auth === "session" ? [{ session: [] }] : r.auth === "apiKey" ? [{ apiKey: [] }] : r.auth === "webhook" ? [{ apiKey: [], webhookSignature: [] }] : [];
    const body = BODIES[`${r.method} ${r.path}`];
    paths[p] ??= {};
    paths[p][r.method.toLowerCase()] = {
      summary: r.summary,
      tags: [r.auth === "session" ? "Portal" : r.auth === "public" ? "Public" : "Integrations"],
      security,
      parameters: [
        ...params,
        ...(r.auth === "webhook" ? [
          { name: "X-Hausjo-Timestamp", in: "header", required: true, schema: { type: "string" }, description: "Unix seconds; ±300 s tolerance" },
          { name: "X-Hausjo-Signature", in: "header", required: true, schema: { type: "string" }, description: "sha256=HEX(HMAC_SHA256(secret, timestamp + '.' + rawBody))" },
          { name: "X-Hausjo-Event-Id", in: "header", required: true, schema: { type: "string" }, description: "Unique per event; replays are acknowledged idempotently" },
        ] : []),
        ...(r.method === "POST" && r.path === "/withdrawals" ? [{ name: "Idempotency-Key", in: "header", schema: { type: "string" } }] : []),
      ],
      ...(r.method !== "GET" ? { requestBody: { required: true, content: { "application/json": { schema: body ?? { type: "object" } } } } } : {}),
      responses: {
        [String(r.status ?? 200)]: { description: "Success", content: { "application/json": { schema: r.path === "/transactions" ? ref("IngestResponse") : { type: "object" } } } },
        "401": { description: "Unauthenticated", content: { "application/json": { schema: ref("Error") } } },
        "403": { description: "Forbidden (RBAC / object-level / CSRF)", content: { "application/json": { schema: ref("Error") } } },
        "422": { description: "Validation or business rule error", content: { "application/json": { schema: ref("Error") } } },
        "429": { description: "Rate limited", content: { "application/json": { schema: ref("Error") } } },
      },
    };
  }
  return {
    openapi: "3.1.0",
    info: {
      title: "Hausjo Agent Network API",
      version: "1.0.0",
      description: "REST API for PT Hausjo Digital Pro. Money values are whole Rupiah (integers, serialized as strings in responses to preserve precision). Times are ISO 8601; business dates use Asia/Jakarta.",
    },
    servers: [{ url: "/api/v1" }],
    components: {
      securitySchemes: {
        session: { type: "apiKey", in: "cookie", name: "hj_session", description: "Portal session. State-changing requests must be same-origin (CSRF)." },
        apiKey: { type: "apiKey", in: "header", name: "X-Api-Key", description: "Partner API key (bound to one transaction source)." },
        webhookSignature: { type: "apiKey", in: "header", name: "X-Hausjo-Signature" },
      },
      schemas: {
        Error: { type: "object", properties: { error: { type: "object", properties: { code: { type: "string" }, message: { type: "string" }, details: {} } } } },
        Transaction: {
          type: "object", required: ["externalId", "terminalId", "status", "amount", "occurredAt"],
          properties: {
            externalId: { type: "string", description: "Processor transaction id — unique per source (idempotency key)" },
            terminalId: { type: "string", description: "TID of the EDC device" },
            processorMid: { type: "string" },
            type: { type: "string", example: "PURCHASE", description: "PURCHASE, QRIS, REFUND, VOID, TEST…" },
            status: { type: "string", enum: ["SUCCESS", "FAILED", "PENDING", "REVERSED"], description: "Synonyms accepted (APPROVED, DECLINED, VOIDED…)" },
            amount: { oneOf: [{ type: "integer" }, { type: "string" }], description: "Whole Rupiah" },
            occurredAt: { type: "string", description: "ISO 8601; without offset interpreted as Asia/Jakarta" },
            settlementRef: { type: "string" },
            isTest: { type: "boolean" },
          },
        },
        TransactionIngestRequest: { type: "object", required: ["transactions"], properties: { transactions: { type: "array", maxItems: 5000, items: ref("Transaction") } } },
        IngestResponse: { type: "object", properties: { results: { type: "array", items: { type: "object", properties: { externalId: { type: "string" }, result: { enum: ["CREATED", "UPDATED", "DUPLICATE", "CONFLICT", "REJECTED"] }, transactionId: { type: "string" }, errors: { type: "array", items: { type: "string" } } } } } } },
        Settlement: { type: "object", required: ["settlementRef", "settlementDate", "expectedCount", "expectedAmount"], properties: { settlementRef: { type: "string" }, settlementDate: { type: "string", format: "date" }, expectedCount: { type: "integer" }, expectedAmount: { oneOf: [{ type: "integer" }, { type: "string" }] } } },
        SettlementIngestRequest: { type: "object", required: ["settlements"], properties: { settlements: { type: "array", items: ref("Settlement") } } },
        WebhookPayload: { type: "object", required: ["type", "data"], properties: { type: { enum: ["transactions", "settlements"] }, data: { type: "array", items: { oneOf: [ref("Transaction"), ref("Settlement")] } } } },
        MerchantLeadInput: { type: "object", required: ["businessName", "ownerName", "phone", "businessType", "addressLine", "city", "province", "productId"], properties: { businessName: { type: "string" }, ownerName: { type: "string" }, phone: { type: "string" }, email: { type: "string" }, businessType: { type: "string" }, addressLine: { type: "string" }, city: { type: "string" }, province: { type: "string" }, postalCode: { type: "string" }, latitude: { type: "number" }, longitude: { type: "number" }, productId: { type: "string" }, notes: { type: "string" } } },
        AgentRegistration: { type: "object", required: ["fullName", "phone", "email", "password", "addressLine", "city", "province", "bankCode", "accountHolderName", "accountNumber", "otpChallengeId", "otpCode", "consentTerms", "consentPrivacy", "consentDataProcessing"], properties: { fullName: { type: "string" }, phone: { type: "string" }, email: { type: "string" }, password: { type: "string", minLength: 10 }, addressLine: { type: "string" }, city: { type: "string" }, province: { type: "string" }, postalCode: { type: "string" }, bankCode: { type: "string" }, accountHolderName: { type: "string" }, accountNumber: { type: "string" }, referralCode: { type: "string" }, otpChallengeId: { type: "string" }, otpCode: { type: "string" }, consentTerms: { const: true }, consentPrivacy: { const: true }, consentDataProcessing: { const: true }, consentWhatsapp: { type: "boolean" } } },
      },
    },
    paths,
  };
}
