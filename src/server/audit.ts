import "server-only";
import type { Db } from "./db";
import type { Actor } from "./rbac";
import { redact } from "./redact";
import { Prisma } from "@prisma/client";

export interface AuditInput {
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  metadata?: Record<string, unknown>;
}

const json = (v: unknown) => (v === undefined ? undefined : v === null ? Prisma.JsonNull : (redact(v) as Prisma.InputJsonValue));

export async function audit(db: Db, actor: Actor, input: AuditInput): Promise<void> {
  await db.auditLog.create({
    data: {
      actorUserId: actor.userId,
      actorRole: actor.kind === "user" ? actor.roles.join(",") : actor.kind === "api" ? `api:${actor.apiClientId}` : "system",
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      before: json(input.before),
      after: json(input.after),
      metadata: (redact(input.metadata ?? {}) as Prisma.InputJsonValue),
      ip: actor.ip ?? null,
    },
  });
}
