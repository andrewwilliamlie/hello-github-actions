import "server-only";
import type { Severity } from "@prisma/client";
import { prisma, type Db } from "../db";
import { notifyRole } from "../notifications/notify";
import { audit } from "../audit";
import { requirePermission, type Actor } from "../rbac";
import { notFound } from "../errors";

export async function raiseFraudFlag(
  db: Db,
  input: { type: string; severity: Severity; agentId?: string | null; merchantId?: string | null; transactionId?: string | null; details?: Record<string, unknown>; dedupeKey: string },
): Promise<void> {
  const res = await db.fraudFlag.createMany({
    data: [{ type: input.type, severity: input.severity, agentId: input.agentId ?? null, merchantId: input.merchantId ?? null, transactionId: input.transactionId ?? null, details: (input.details ?? {}) as never, dedupeKey: input.dedupeKey }],
    skipDuplicates: true,
  });
  if (res.count > 0) {
    await notifyRole(db, ["SUPER_ADMIN", "OPERATIONS_ADMIN", "FINANCE_ADMIN"], "fraud.flagged", {
      type: input.type, severity: input.severity, subject: input.agentId ? `agen ${input.agentId}` : input.merchantId ? `merchant ${input.merchantId}` : "transaksi",
    }, "/admin/fraud");
  }
}

/** Open MEDIUM/HIGH flags block commission release for the subjects involved. */
export async function blockingFlagCount(db: Db, s: { agentId?: string | null; merchantId?: string | null; transactionId?: string | null }): Promise<number> {
  const OR = [
    s.agentId ? { agentId: s.agentId } : null,
    s.merchantId ? { merchantId: s.merchantId } : null,
    s.transactionId ? { transactionId: s.transactionId } : null,
  ].filter(Boolean) as object[];
  if (!OR.length) return 0;
  return db.fraudFlag.count({ where: { status: "OPEN", severity: { in: ["MEDIUM", "HIGH"] }, OR } });
}

export async function resolveFraudFlag(actor: Actor, flagId: string, outcome: "CLEARED" | "CONFIRMED", resolution: string) {
  requirePermission(actor, "fraud.manage");
  return prisma.$transaction(async (tx) => {
    const f = await tx.fraudFlag.findUnique({ where: { id: flagId } });
    if (!f) throw notFound("Tanda risiko");
    const updated = await tx.fraudFlag.update({ where: { id: flagId }, data: { status: outcome, resolution, resolvedById: actor.userId, resolvedAt: new Date() } });
    await audit(tx, actor, { action: `fraud.${outcome.toLowerCase()}`, entityType: "FraudFlag", entityId: flagId, before: { status: f.status }, after: { status: outcome, resolution } });
    return updated;
  });
}
