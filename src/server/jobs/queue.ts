import "server-only";
import { Prisma } from "@prisma/client";
import { prisma, type Db } from "../db";

export async function enqueueJob(
  db: Db,
  type: string,
  payload: Record<string, unknown>,
  opts: { dedupeKey?: string; runAt?: Date; maxAttempts?: number } = {},
): Promise<void> {
  // createMany + skipDuplicates = INSERT … ON CONFLICT DO NOTHING: safe inside a transaction.
  await db.job.createMany({
    data: [{ type, payload: payload as Prisma.InputJsonValue, dedupeKey: opts.dedupeKey, runAt: opts.runAt ?? new Date(), maxAttempts: opts.maxAttempts ?? 5 }],
    skipDuplicates: true,
  });
}

export interface ClaimedJob { id: string; type: string; payload: Record<string, unknown>; attempts: number; maxAttempts: number }

/** Claim up to `limit` due jobs with FOR UPDATE SKIP LOCKED (safe with many workers). */
export async function claimJobs(workerId: string, limit = 10): Promise<ClaimedJob[]> {
  return prisma.$queryRaw<ClaimedJob[]>`
    UPDATE "Job" SET "status" = 'RUNNING', "lockedAt" = now(), "lockedBy" = ${workerId}, "attempts" = "attempts" + 1
    WHERE "id" IN (
      SELECT "id" FROM "Job" WHERE "status" = 'QUEUED' AND "runAt" <= now()
      ORDER BY "runAt" ASC LIMIT ${limit} FOR UPDATE SKIP LOCKED)
    RETURNING "id", "type", "payload", "attempts", "maxAttempts"`;
}

export async function completeJob(id: string) {
  await prisma.job.update({ where: { id }, data: { status: "SUCCEEDED", finishedAt: new Date(), lockedAt: null } });
}

export async function failJob(job: ClaimedJob, error: unknown) {
  const message = (error instanceof Error ? error.message : String(error)).slice(0, 2000);
  const dead = job.attempts >= job.maxAttempts;
  const backoffMs = Math.min(2 ** job.attempts * 15_000, 3600_000);
  await prisma.job.update({
    where: { id: job.id },
    data: dead
      ? { status: "DEAD", lastError: message, finishedAt: new Date(), lockedAt: null }
      : { status: "QUEUED", lastError: message, runAt: new Date(Date.now() + backoffMs), lockedAt: null },
  });
}

/** Re-queue jobs stuck in RUNNING (worker crashed). */
export async function recoverStuckJobs(olderThanMinutes = 15) {
  return prisma.job.updateMany({
    where: { status: "RUNNING", lockedAt: { lt: new Date(Date.now() - olderThanMinutes * 60_000) } },
    data: { status: "QUEUED", lockedAt: null },
  });
}
