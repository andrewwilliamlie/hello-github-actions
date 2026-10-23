import "server-only";
import { prisma } from "../db";
import { AppError } from "../errors";

/** Fixed-window counter stored in Postgres (works across instances). Throws RATE_LIMITED. */
export async function rateLimit(key: string, limit: number, windowSeconds: number): Promise<void> {
  const now = Date.now();
  const windowStart = new Date(Math.floor(now / (windowSeconds * 1000)) * windowSeconds * 1000);
  const rows = await prisma.$queryRaw<{ count: number }[]>`
    INSERT INTO "RateLimitBucket" ("key", "windowStart", "count") VALUES (${key}, ${windowStart}, 1)
    ON CONFLICT ("key", "windowStart") DO UPDATE SET "count" = "RateLimitBucket"."count" + 1
    RETURNING "count"`;
  const count = Number(rows[0]?.count ?? 0);
  if (count > limit) {
    throw new AppError("RATE_LIMITED", "Terlalu banyak percobaan. Silakan coba lagi nanti.", { retryAfterSeconds: windowSeconds });
  }
}

export async function pruneRateLimits(olderThanHours = 48): Promise<number> {
  const r = await prisma.rateLimitBucket.deleteMany({ where: { windowStart: { lt: new Date(Date.now() - olderThanHours * 3600_000) } } });
  return r.count;
}
