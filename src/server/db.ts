import "server-only";
import { Prisma, PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({ log: process.env.PRISMA_LOG === "query" ? ["query", "warn", "error"] : ["warn", "error"] });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export type Tx = Prisma.TransactionClient;
export type Db = PrismaClient | Tx;

/** Run `fn` in a transaction. Default isolation READ COMMITTED + explicit row locks where needed. */
export function withTx<T>(fn: (tx: Tx) => Promise<T>, opts?: { timeout?: number; isolationLevel?: Prisma.TransactionIsolationLevel }): Promise<T> {
  return prisma.$transaction(fn, { timeout: opts?.timeout ?? 20_000, maxWait: 10_000, isolationLevel: opts?.isolationLevel });
}

export function isUniqueViolation(err: unknown, target?: string): boolean {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== "P2002") return false;
  if (!target) return true;
  const t = (err.meta?.target ?? "") as string | string[];
  return Array.isArray(t) ? t.some((x) => x.includes(target)) : String(t).includes(target);
}

/** Postgres check_violation raised by our CHECK constraints / triggers. */
export function isCheckViolation(err: unknown, needle?: string): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  const isCheck = msg.includes("23514") || msg.includes("check constraint") || msg.includes("check_violation") || msg.includes("violates check");
  return isCheck && (!needle || msg.includes(needle));
}
