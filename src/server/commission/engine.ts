// Pure, deterministic commission rule engine. No database access — fully unit-testable.
import { applyBps, minRupiah, type Rupiah } from "@/lib/money";

export type CommissionType = "SALES" | "TRANSACTION_REWARD" | "REFERRAL_SALES" | "REFERRAL_TRANSACTION" | "ADJUSTMENT";

export interface RuleConditions {
  transactionTypes?: string[]; // allow-list of transaction types (TRANSACTION_REWARD)
  sources?: string[]; // allow-list of processors/partners
  merchantIds?: string[]; // allow-list of merchants
  excludeMerchantIds?: string[];
  minTransactionAmount?: string; // Rupiah as string
}

export interface EngineRule {
  id: string;
  code: string;
  version: number;
  type: CommissionType;
  status: string;
  name: string;
  productId: string | null;
  fixedAmount: Rupiah | null;
  rateBps: number | null;
  capAmount: Rupiah | null;
  conditions: RuleConditions;
  priority: number;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  holdDays: number;
  requiresManualApproval: boolean;
  deductFromRecruit: boolean;
  isDemo: boolean;
}

export interface MatchContext {
  type: CommissionType;
  at: Date;
  productId?: string | null;
  transactionType?: string;
  source?: string;
  merchantId?: string | null;
  amount?: Rupiah;
}

export function isEffective(rule: Pick<EngineRule, "effectiveFrom" | "effectiveTo">, at: Date): boolean {
  return rule.effectiveFrom.getTime() <= at.getTime() && (rule.effectiveTo === null || at.getTime() < rule.effectiveTo.getTime());
}

function specificity(rule: EngineRule): number {
  const c = rule.conditions ?? {};
  return (rule.productId ? 4 : 0) + (c.merchantIds?.length ? 3 : 0) + (c.sources?.length ? 2 : 0) + (c.transactionTypes?.length ? 1 : 0);
}

export function ruleMatches(rule: EngineRule, ctx: MatchContext): boolean {
  if (rule.type !== ctx.type || rule.status !== "ACTIVE" || !isEffective(rule, ctx.at)) return false;
  const c = rule.conditions ?? {};
  if (rule.productId && rule.productId !== ctx.productId) return false;
  if (c.transactionTypes?.length && (!ctx.transactionType || !c.transactionTypes.includes(ctx.transactionType))) return false;
  if (c.sources?.length && (!ctx.source || !c.sources.includes(ctx.source))) return false;
  if (c.merchantIds?.length && (!ctx.merchantId || !c.merchantIds.includes(ctx.merchantId))) return false;
  if (c.excludeMerchantIds?.length && ctx.merchantId && c.excludeMerchantIds.includes(ctx.merchantId)) return false;
  if (c.minTransactionAmount && ctx.amount !== undefined && ctx.amount < BigInt(c.minTransactionAmount)) return false;
  return true;
}

/**
 * Select the applicable rule: highest priority, then most specific, then the most recently
 * effective, then the highest version. Returns null if nothing applies (→ no commission).
 */
export function selectRule(rules: EngineRule[], ctx: MatchContext): EngineRule | null {
  const candidates = rules.filter((r) => ruleMatches(r, ctx));
  candidates.sort(
    (a, b) =>
      b.priority - a.priority ||
      specificity(b) - specificity(a) ||
      b.effectiveFrom.getTime() - a.effectiveFrom.getTime() ||
      b.version - a.version,
  );
  return candidates[0] ?? null;
}

export interface Calculation {
  formula: string;
  inputs: Record<string, string | number>;
  rule: { id: string; code: string; version: number; name: string; isDemo: boolean };
  capped: boolean;
  result: string;
}

export interface CalcResult { amount: Rupiah; calculation: Calculation }

function ruleRef(rule: EngineRule) {
  return { id: rule.id, code: rule.code, version: rule.version, name: rule.name, isDemo: rule.isDemo };
}

function applyCap(amount: Rupiah, cap: Rupiah | null): { amount: Rupiah; capped: boolean } {
  if (cap !== null && amount > cap) return { amount: minRupiah(amount, cap), capped: true };
  return { amount, capped: false };
}

/** One sales commission per eligible sale: fixed SKU amount × quantity (quantity is 1 per order today). */
export function calculateSalesCommission(rule: EngineRule, input: { orderRef: string; productSku: string; quantity: number }): CalcResult {
  if (rule.type !== "SALES" || rule.fixedAmount === null) throw new Error(`Rule ${rule.code} v${rule.version} is not a fixed SALES rule`);
  if (!Number.isInteger(input.quantity) || input.quantity < 1) throw new Error("quantity must be a positive integer");
  const raw = rule.fixedAmount * BigInt(input.quantity);
  const { amount, capped } = applyCap(raw, rule.capAmount);
  return {
    amount,
    calculation: {
      formula: `${rule.fixedAmount} × ${input.quantity}${capped ? ` (cap ${rule.capAmount})` : ""}`,
      inputs: { order: input.orderRef, sku: input.productSku, quantity: input.quantity, fixedAmount: rule.fixedAmount.toString() },
      rule: ruleRef(rule),
      capped,
      result: amount.toString(),
    },
  };
}

/** Recurring reward per eligible, settled transaction (e.g. Rp500). */
export function calculateTransactionReward(rule: EngineRule, input: { transactionRef: string; transactionType: string; transactionAmount: Rupiah }): CalcResult {
  if (rule.type !== "TRANSACTION_REWARD" || rule.fixedAmount === null) throw new Error(`Rule ${rule.code} v${rule.version} is not a fixed TRANSACTION_REWARD rule`);
  const { amount, capped } = applyCap(rule.fixedAmount, rule.capAmount);
  return {
    amount,
    calculation: {
      formula: `${rule.fixedAmount} per transaksi settle${capped ? ` (cap ${rule.capAmount})` : ""}`,
      inputs: { transaction: input.transactionRef, type: input.transactionType, transactionAmount: input.transactionAmount.toString() },
      rule: ruleRef(rule),
      capped,
      result: amount.toString(),
    },
  };
}

/**
 * Referral share = floor(recruit's eligible NET commission × rateBps / 10 000), optionally capped.
 * Never based on merchant gross transaction value.
 */
export function calculateReferralShare(rule: EngineRule, input: { baseEventRef: string; baseNetAmount: Rupiah; recruitCode: string }): CalcResult {
  if ((rule.type !== "REFERRAL_SALES" && rule.type !== "REFERRAL_TRANSACTION") || rule.rateBps === null) {
    throw new Error(`Rule ${rule.code} v${rule.version} is not a REFERRAL rule`);
  }
  const raw = applyBps(input.baseNetAmount, rule.rateBps);
  const { amount, capped } = applyCap(raw, rule.capAmount);
  return {
    amount,
    calculation: {
      formula: `floor(${input.baseNetAmount} × ${rule.rateBps} / 10000)${capped ? ` (cap ${rule.capAmount})` : ""}`,
      inputs: { baseEvent: input.baseEventRef, baseNetAmount: input.baseNetAmount.toString(), rateBps: rule.rateBps, recruit: input.recruitCode },
      rule: ruleRef(rule),
      capped,
      result: amount.toString(),
    },
  };
}

export function snapshotRule(rule: EngineRule) {
  return {
    id: rule.id, code: rule.code, version: rule.version, type: rule.type, name: rule.name, productId: rule.productId,
    fixedAmount: rule.fixedAmount?.toString() ?? null, rateBps: rule.rateBps, capAmount: rule.capAmount?.toString() ?? null,
    conditions: rule.conditions, priority: rule.priority, effectiveFrom: rule.effectiveFrom.toISOString(),
    effectiveTo: rule.effectiveTo?.toISOString() ?? null, holdDays: rule.holdDays,
    requiresManualApproval: rule.requiresManualApproval, deductFromRecruit: rule.deductFromRecruit, isDemo: rule.isDemo,
  };
}

/** Validates a SALES rule amount against the configured business range (default Rp50.000–Rp150.000). */
export function validateSalesAmount(amount: Rupiah, min: Rupiah, max: Rupiah): string | null {
  if (amount < min || amount > max) return `Komisi penjualan harus antara Rp${min.toLocaleString("id-ID")} dan Rp${max.toLocaleString("id-ID")}.`;
  return null;
}

/** Map a referral base type to the referral commission type. */
export function referralTypeFor(base: CommissionType): CommissionType | null {
  if (base === "SALES") return "REFERRAL_SALES";
  if (base === "TRANSACTION_REWARD") return "REFERRAL_TRANSACTION";
  return null; // referral events never generate further referral events (no multi-level)
}
