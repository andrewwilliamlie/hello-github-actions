import "server-only";
import { z } from "zod";
import { prisma } from "../db";
import { audit } from "../audit";
import { decryptField, encryptField, hmacSha256Hex, randomToken, safeEqual, sha256Hex } from "../crypto";
import { enqueueJob } from "../jobs/queue";
import { ingestSettlements, ingestTransactions } from "./transactions";
import { requirePermission, type Actor } from "../rbac";
import { AppError, invalid, notFound } from "../errors";
import { rateLimit } from "../auth/rate-limit";

// ─────────────────────────────── API clients ───────────────────────────────

export async function createApiClient(actor: Actor, input: { name: string; partnerSource: string; scopes: string[] }) {
  requirePermission(actor, "webhook.manage");
  const source = input.partnerSource.trim().toUpperCase();
  if (!/^[A-Z0-9_]{2,40}$/.test(source)) throw invalid("Kode sumber tidak valid.");
  const prefix = randomToken(6).replace(/[^A-Za-z0-9]/g, "x").slice(0, 8);
  const apiKey = `hj_${prefix}_${randomToken(24)}`;
  const webhookSecret = `whsec_${randomToken(24)}`;
  const client = await prisma.apiClient.create({
    data: { name: input.name.trim(), partnerSource: source, keyPrefix: prefix, keyHash: sha256Hex(apiKey), webhookSecretEnc: encryptField(webhookSecret), scopes: input.scopes },
  });
  await audit(prisma, actor, { action: "api_client.create", entityType: "ApiClient", entityId: client.id, after: { name: client.name, source, scopes: input.scopes } });
  return { client, apiKey, webhookSecret }; // shown once
}

export async function revokeApiClient(actor: Actor, id: string) {
  requirePermission(actor, "webhook.manage");
  await prisma.apiClient.update({ where: { id }, data: { isActive: false } });
  await audit(prisma, actor, { action: "api_client.revoke", entityType: "ApiClient", entityId: id });
}

export async function authenticateApiKey(apiKey: string | null): Promise<Actor> {
  if (!apiKey) throw new AppError("UNAUTHENTICATED", "X-Api-Key wajib diisi.");
  const client = await prisma.apiClient.findUnique({ where: { keyHash: sha256Hex(apiKey) } });
  if (!client || !client.isActive) throw new AppError("UNAUTHENTICATED", "API key tidak valid.");
  await rateLimit(`api:${client.id}`, 600, 60);
  await prisma.apiClient.update({ where: { id: client.id }, data: { lastUsedAt: new Date() } });
  return { kind: "api", userId: null, roles: [], apiClientId: client.id, apiSource: client.partnerSource, name: client.name };
}

export function requireScope(actor: Actor, scope: string, scopes?: string[]) {
  if (actor.kind !== "api") return;
  if (!scopes?.includes(scope)) throw new AppError("FORBIDDEN", `Scope ${scope} diperlukan.`);
}

// ─────────────────────────────── Webhooks ───────────────────────────────

const MAX_SKEW_SECONDS = 300;

export function signWebhook(secret: string, timestamp: string, rawBody: string) {
  return `sha256=${hmacSha256Hex(secret, `${timestamp}.${rawBody}`)}`;
}

const webhookPayload = z.object({
  type: z.enum(["transactions", "settlements"]),
  data: z.array(z.unknown()).min(1).max(5000),
});

/**
 * Verify, persist and enqueue an inbound webhook. Returns quickly (202); processing is async with
 * retries and a dead-letter queue. Replays with the same event id are acknowledged idempotently.
 */
export async function receiveWebhook(headers: { apiKey: string | null; timestamp: string | null; signature: string | null; eventId: string | null }, rawBody: string) {
  const actor = await authenticateApiKey(headers.apiKey);
  const client = await prisma.apiClient.findUniqueOrThrow({ where: { id: actor.apiClientId! } });
  if (!client.webhookSecretEnc) throw new AppError("FORBIDDEN", "Webhook tidak diaktifkan untuk klien ini.");
  if (!headers.timestamp || !headers.signature || !headers.eventId) throw invalid("Header X-Hausjo-Timestamp, X-Hausjo-Signature dan X-Hausjo-Event-Id wajib.");
  if (!/^[\w.:-]{1,120}$/.test(headers.eventId)) throw invalid("X-Hausjo-Event-Id tidak valid.");
  const ts = Number(headers.timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > MAX_SKEW_SECONDS) throw new AppError("UNAUTHENTICATED", "Timestamp webhook di luar toleransi.");
  const expected = signWebhook(decryptField(client.webhookSecretEnc), headers.timestamp, rawBody);
  if (!safeEqual(expected, headers.signature)) throw new AppError("UNAUTHENTICATED", "Tanda tangan webhook tidak valid.");
  let payload: z.infer<typeof webhookPayload>;
  try {
    payload = webhookPayload.parse(JSON.parse(rawBody));
  } catch {
    throw invalid("Payload webhook tidak valid.");
  }
  const existing = await prisma.webhookEvent.findUnique({ where: { provider_externalEventId: { provider: client.partnerSource, externalEventId: headers.eventId } } });
  if (existing) return { id: existing.id, duplicate: true, status: existing.status };
  const ev = await prisma.$transaction(async (tx) => {
    const e = await tx.webhookEvent.create({ data: { provider: client.partnerSource, externalEventId: headers.eventId!, eventType: payload.type, signatureValid: true, payload: payload as never } });
    await enqueueJob(tx, "webhook.process", { webhookEventId: e.id, apiClientId: client.id }, { dedupeKey: `webhook:${e.id}`, maxAttempts: 6 });
    return e;
  });
  return { id: ev.id, duplicate: false, status: ev.status };
}

/** Job handler. Throws to trigger a retry; marks DEAD_LETTER on the final attempt. */
export async function processWebhookEvent(webhookEventId: string, apiClientId: string, attempt: number, maxAttempts: number) {
  const ev = await prisma.webhookEvent.findUnique({ where: { id: webhookEventId } });
  if (!ev || ev.status === "PROCESSED") return;
  const client = await prisma.apiClient.findUnique({ where: { id: apiClientId } });
  if (!client) throw notFound("API client");
  const actor: Actor = { kind: "api", userId: null, roles: [], apiClientId: client.id, apiSource: client.partnerSource };
  try {
    const p = ev.payload as { type: string; data: unknown[] };
    const results = p.type === "settlements" ? await ingestSettlements(actor, client.partnerSource, p.data) : await ingestTransactions(actor, client.partnerSource, p.data, "WEBHOOK");
    const rejected = results.filter((r) => r.result === "REJECTED").length;
    await prisma.webhookEvent.update({ where: { id: ev.id }, data: { status: "PROCESSED", processedAt: new Date(), attempts: attempt, lastError: rejected ? `${rejected} item ditolak (validasi)` : null } });
  } catch (e) {
    const dead = attempt >= maxAttempts;
    await prisma.webhookEvent.update({ where: { id: ev.id }, data: { status: dead ? "DEAD_LETTER" : "FAILED", attempts: attempt, lastError: (e as Error).message.slice(0, 1000) } });
    if (!dead) throw e;
  }
}

export async function replayWebhook(actor: Actor, webhookEventId: string) {
  requirePermission(actor, "webhook.manage");
  const ev = await prisma.webhookEvent.findUnique({ where: { id: webhookEventId } });
  if (!ev) throw notFound("Webhook");
  if (ev.status === "PROCESSED") throw invalid("Webhook sudah diproses.");
  const client = await prisma.apiClient.findFirst({ where: { partnerSource: ev.provider, isActive: true } });
  if (!client) throw invalid("Tidak ada API client aktif untuk sumber ini.");
  await prisma.webhookEvent.update({ where: { id: ev.id }, data: { status: "RECEIVED" } });
  await enqueueJob(prisma, "webhook.process", { webhookEventId: ev.id, apiClientId: client.id }, { dedupeKey: `webhook:${ev.id}:replay:${Date.now()}`, maxAttempts: 6 });
  await audit(prisma, actor, { action: "webhook.replay", entityType: "WebhookEvent", entityId: ev.id });
}
