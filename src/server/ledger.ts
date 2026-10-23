import "server-only";
import type { JournalKind, LedgerAccount, LedgerDirection, Wallet } from "@prisma/client";
import type { Tx } from "./db";
import { AppError } from "./errors";

export interface LedgerLine {
  account: LedgerAccount;
  direction: LedgerDirection;
  amount: bigint;
  agentId?: string | null;
  commissionEventId?: string | null;
  withdrawalId?: string | null;
}

export interface JournalInput {
  journalRef: string; // idempotency key
  kind: JournalKind;
  description: string;
  agentId?: string | null;
  createdById?: string | null;
  lines: LedgerLine[];
}

const AGENT_ACCOUNTS: LedgerAccount[] = ["AGENT_PENDING", "AGENT_PAYABLE", "AGENT_RESERVED", "AGENT_RECEIVABLE"];
const WALLET_FIELD: Partial<Record<LedgerAccount, keyof Pick<Wallet, "pendingBalance" | "payableBalance" | "reservedBalance" | "receivableBalance">>> = {
  AGENT_PENDING: "pendingBalance",
  AGENT_PAYABLE: "payableBalance",
  AGENT_RESERVED: "reservedBalance",
  AGENT_RECEIVABLE: "receivableBalance",
};

/** Signed effect of a line on the wallet balance of its account. Liabilities are credit-normal; receivable is debit-normal. */
export function balanceEffect(line: Pick<LedgerLine, "account" | "direction" | "amount">): bigint {
  const creditNormal = line.account !== "AGENT_RECEIVABLE";
  const sign = (line.direction === "CREDIT") === creditNormal ? 1n : -1n;
  return sign * line.amount;
}

export function assertBalanced(lines: LedgerLine[]): void {
  let debit = 0n;
  let credit = 0n;
  for (const l of lines) {
    if (l.amount <= 0n) throw new Error("Ledger line amounts must be positive");
    if (AGENT_ACCOUNTS.includes(l.account) && !l.agentId) throw new Error(`Account ${l.account} requires agentId`);
    if (l.direction === "DEBIT") debit += l.amount;
    else credit += l.amount;
  }
  if (debit !== credit) throw new Error(`Unbalanced journal: debit ${debit} ≠ credit ${credit}`);
}

/** Lock and return the wallet row (SELECT … FOR UPDATE). Serializes postings per agent. */
export async function lockWallet(tx: Tx, agentId: string): Promise<Wallet> {
  const rows = await tx.$queryRaw<Wallet[]>`SELECT * FROM "Wallet" WHERE "agentId" = ${agentId} FOR UPDATE`;
  if (!rows[0]) throw new AppError("NOT_FOUND", "Dompet agen tidak ditemukan.");
  return rows[0];
}

/**
 * Post a balanced journal and update cached wallet balances in the same transaction.
 * Idempotent by journalRef: re-posting returns { created: false } without side effects.
 */
export async function postJournal(tx: Tx, input: JournalInput): Promise<{ journalId: string; created: boolean }> {
  const lines = input.lines.filter((l) => l.amount !== 0n);
  if (lines.length === 0) throw new Error("Journal has no non-zero lines");
  assertBalanced(lines);

  const existing = await tx.ledgerJournal.findUnique({ where: { journalRef: input.journalRef } });
  if (existing) return { journalId: existing.id, created: false };

  // Lock affected wallets in a stable order (avoid deadlocks), then verify no balance goes negative.
  const agentIds = [...new Set(lines.filter((l) => l.agentId && WALLET_FIELD[l.account]).map((l) => l.agentId!))].sort();
  const deltas = new Map<string, Record<string, bigint>>();
  for (const agentId of agentIds) {
    const w = await lockWallet(tx, agentId);
    const d: Record<string, bigint> = { pendingBalance: 0n, payableBalance: 0n, reservedBalance: 0n, receivableBalance: 0n };
    for (const l of lines) if (l.agentId === agentId && WALLET_FIELD[l.account]) d[WALLET_FIELD[l.account]!] += balanceEffect(l);
    for (const [field, delta] of Object.entries(d)) {
      if ((w[field as keyof Wallet] as bigint) + delta < 0n) {
        throw new AppError("INSUFFICIENT_BALANCE", "Saldo tidak mencukupi untuk transaksi ini.", { field, agentId });
      }
    }
    deltas.set(agentId, d);
  }

  const journal = await tx.ledgerJournal.create({
    data: { journalRef: input.journalRef, kind: input.kind, description: input.description, agentId: input.agentId ?? null, createdById: input.createdById ?? null },
  });
  await tx.commissionLedgerEntry.createMany({
    data: lines.map((l) => ({
      journalId: journal.id, account: l.account, direction: l.direction, amount: l.amount,
      agentId: l.agentId ?? null, commissionEventId: l.commissionEventId ?? null, withdrawalId: l.withdrawalId ?? null,
    })),
  });
  for (const [agentId, d] of deltas) {
    await tx.$executeRaw`UPDATE "Wallet" SET
      "pendingBalance" = "pendingBalance" + ${d.pendingBalance},
      "payableBalance" = "payableBalance" + ${d.payableBalance},
      "reservedBalance" = "reservedBalance" + ${d.reservedBalance},
      "receivableBalance" = "receivableBalance" + ${d.receivableBalance},
      "version" = "version" + 1, "updatedAt" = now()
      WHERE "agentId" = ${agentId}`;
  }
  return { journalId: journal.id, created: true };
}

/** Recompute an agent's balances from the ledger (source of truth) for verification. */
export async function ledgerBalances(tx: Tx, agentId: string) {
  const rows = await tx.commissionLedgerEntry.groupBy({ by: ["account", "direction"], where: { agentId }, _sum: { amount: true } });
  const out = { pendingBalance: 0n, payableBalance: 0n, reservedBalance: 0n, receivableBalance: 0n };
  for (const r of rows) {
    const field = WALLET_FIELD[r.account];
    if (field) out[field] += balanceEffect({ account: r.account, direction: r.direction, amount: r._sum.amount ?? 0n });
  }
  return out;
}

// Convenience builders ----------------------------------------------------------------------------

export const dr = (account: LedgerAccount, amount: bigint, extra: Partial<LedgerLine> = {}): LedgerLine => ({ account, direction: "DEBIT", amount, ...extra });
export const cr = (account: LedgerAccount, amount: bigint, extra: Partial<LedgerLine> = {}): LedgerLine => ({ account, direction: "CREDIT", amount, ...extra });
