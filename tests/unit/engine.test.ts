import { describe, expect, it } from "vitest";
import {
  calculateReferralShare, calculateSalesCommission, calculateTransactionReward, isEffective, referralTypeFor, selectRule, snapshotRule, validateSalesAmount, type EngineRule,
} from "@/server/commission/engine";

const rule = (o: Partial<EngineRule>): EngineRule => ({
  id: o.code ?? "r", code: "R", version: 1, type: "SALES", status: "ACTIVE", name: "rule", productId: null, fixedAmount: null, rateBps: null, capAmount: null,
  conditions: {}, priority: 0, effectiveFrom: new Date("2026-01-01T00:00:00Z"), effectiveTo: null, holdDays: 0, requiresManualApproval: false, deductFromRecruit: false, isDemo: false, ...o,
});

describe("rule effective dates", () => {
  const r = rule({ effectiveFrom: new Date("2026-03-01T00:00:00Z"), effectiveTo: new Date("2026-04-01T00:00:00Z") });
  it("is inclusive at start and exclusive at end", () => {
    expect(isEffective(r, new Date("2026-02-28T23:59:59Z"))).toBe(false);
    expect(isEffective(r, new Date("2026-03-01T00:00:00Z"))).toBe(true);
    expect(isEffective(r, new Date("2026-03-31T23:59:59Z"))).toBe(true);
    expect(isEffective(r, new Date("2026-04-01T00:00:00Z"))).toBe(false);
  });
  it("selects the version in force at the event time, not today's", () => {
    const v1 = rule({ code: "S", version: 1, productId: "p", fixedAmount: 75_000n, effectiveTo: new Date("2026-06-01T00:00:00Z") });
    const v2 = rule({ code: "S", version: 2, productId: "p", fixedAmount: 100_000n, effectiveFrom: new Date("2026-06-01T00:00:00Z") });
    expect(selectRule([v1, v2], { type: "SALES", at: new Date("2026-05-31T12:00:00Z"), productId: "p" })?.fixedAmount).toBe(75_000n);
    expect(selectRule([v1, v2], { type: "SALES", at: new Date("2026-06-01T00:00:00Z"), productId: "p" })?.fixedAmount).toBe(100_000n);
  });
  it("ignores rules that are not ACTIVE", () => {
    expect(selectRule([rule({ status: "DRAFT", productId: "p", fixedAmount: 1n })], { type: "SALES", at: new Date(), productId: "p" })).toBeNull();
    expect(selectRule([rule({ status: "RETIRED", productId: "p", fixedAmount: 1n })], { type: "SALES", at: new Date(), productId: "p" })).toBeNull();
  });
});

describe("rule selection", () => {
  it("matches SKU-specific rules only to that product", () => {
    const r = rule({ productId: "a920", fixedAmount: 120_000n });
    expect(selectRule([r], { type: "SALES", at: new Date(), productId: "d210" })).toBeNull();
    expect(selectRule([r], { type: "SALES", at: new Date(), productId: "a920" })).toBe(r);
  });
  it("prefers priority, then specificity, then later effective date, then version", () => {
    const generic = rule({ code: "G", type: "TRANSACTION_REWARD", fixedAmount: 500n });
    const partner = rule({ code: "P", type: "TRANSACTION_REWARD", fixedAmount: 700n, conditions: { sources: ["PARTNER_A"] } });
    const promo = rule({ code: "X", type: "TRANSACTION_REWARD", fixedAmount: 900n, priority: 10 });
    const ctx = { type: "TRANSACTION_REWARD" as const, at: new Date(), source: "PARTNER_A", transactionType: "PURCHASE" };
    expect(selectRule([generic, partner], ctx)?.code).toBe("P");
    expect(selectRule([generic, partner, promo], ctx)?.code).toBe("X");
    expect(selectRule([generic, partner], { ...ctx, source: "OTHER" })?.code).toBe("G");
  });
  it("applies transaction-type, merchant include/exclude and minimum-amount conditions", () => {
    const r = rule({ type: "TRANSACTION_REWARD", fixedAmount: 500n, conditions: { transactionTypes: ["PURCHASE", "QRIS"], excludeMerchantIds: ["m-bad"], minTransactionAmount: "10000" } });
    const base = { type: "TRANSACTION_REWARD" as const, at: new Date(), merchantId: "m1", amount: 50_000n };
    expect(selectRule([r], { ...base, transactionType: "QRIS" })).toBe(r);
    expect(selectRule([r], { ...base, transactionType: "REFUND" })).toBeNull();
    expect(selectRule([r], { ...base, transactionType: "QRIS", merchantId: "m-bad" })).toBeNull();
    expect(selectRule([r], { ...base, transactionType: "QRIS", amount: 9_999n })).toBeNull();
    const only = rule({ type: "TRANSACTION_REWARD", fixedAmount: 600n, conditions: { merchantIds: ["m2"] } });
    expect(selectRule([only], { ...base, transactionType: "QRIS" })).toBeNull();
  });
});

describe("formulas", () => {
  it("sales commission = fixed SKU amount × quantity, capped", () => {
    const r = rule({ productId: "p", fixedAmount: 100_000n });
    expect(calculateSalesCommission(r, { orderRef: "ORD-1", productSku: "A920", quantity: 1 }).amount).toBe(100_000n);
    expect(calculateSalesCommission(r, { orderRef: "ORD-2", productSku: "A920", quantity: 2 }).amount).toBe(200_000n);
    const capped = calculateSalesCommission({ ...r, capAmount: 150_000n }, { orderRef: "ORD-3", productSku: "A920", quantity: 2 });
    expect(capped.amount).toBe(150_000n);
    expect(capped.calculation.capped).toBe(true);
    expect(() => calculateSalesCommission(r, { orderRef: "x", productSku: "s", quantity: 0 })).toThrow();
  });
  it("transaction reward = Rp500 flat regardless of transaction amount", () => {
    const r = rule({ type: "TRANSACTION_REWARD", fixedAmount: 500n });
    expect(calculateTransactionReward(r, { transactionRef: "t1", transactionType: "PURCHASE", transactionAmount: 10_000_000n }).amount).toBe(500n);
    expect(calculateTransactionReward(r, { transactionRef: "t2", transactionType: "QRIS", transactionAmount: 1_000n }).amount).toBe(500n);
  });
  it("referral share is floor(net × bps / 10000) of the recruit's NET commission, with cap", () => {
    const r = rule({ type: "REFERRAL_SALES", rateBps: 1250 });
    expect(calculateReferralShare(r, { baseEventRef: "SALE:1", baseNetAmount: 100_000n, recruitCode: "HJA" }).amount).toBe(12_500n);
    expect(calculateReferralShare({ ...r, type: "REFERRAL_TRANSACTION", rateBps: 333 }, { baseEventRef: "TXN:1", baseNetAmount: 500n, recruitCode: "HJA" }).amount).toBe(16n);
    expect(calculateReferralShare({ ...r, capAmount: 5_000n }, { baseEventRef: "SALE:1", baseNetAmount: 100_000n, recruitCode: "HJA" }).amount).toBe(5_000n);
  });
  it("explanations carry rule code, version and inputs", () => {
    const r = rule({ code: "SALES:A920", version: 3, productId: "p", fixedAmount: 90_000n });
    const c = calculateSalesCommission(r, { orderRef: "ORD-9", productSku: "A920", quantity: 1 }).calculation;
    expect(c.rule).toMatchObject({ code: "SALES:A920", version: 3 });
    expect(c.inputs.order).toBe("ORD-9");
    expect(c.result).toBe("90000");
  });
  it("snapshots are plain JSON (bigint as string)", () => {
    const s = snapshotRule(rule({ fixedAmount: 100_000n }));
    expect(s.fixedAmount).toBe("100000");
    expect(() => JSON.stringify(s)).not.toThrow();
  });
  it("rejects the wrong rule type for a formula", () => {
    expect(() => calculateTransactionReward(rule({ fixedAmount: 1n }), { transactionRef: "t", transactionType: "P", transactionAmount: 1n })).toThrow();
    expect(() => calculateReferralShare(rule({ fixedAmount: 1n }), { baseEventRef: "b", baseNetAmount: 1n, recruitCode: "c" })).toThrow();
  });
});

describe("business constraints", () => {
  it("validates sales commission range Rp50.000–Rp150.000", () => {
    expect(validateSalesAmount(50_000n, 50_000n, 150_000n)).toBeNull();
    expect(validateSalesAmount(150_000n, 50_000n, 150_000n)).toBeNull();
    expect(validateSalesAmount(49_999n, 50_000n, 150_000n)).not.toBeNull();
    expect(validateSalesAmount(150_001n, 50_000n, 150_000n)).not.toBeNull();
  });
  it("referral events never generate further referral events (one level only)", () => {
    expect(referralTypeFor("SALES")).toBe("REFERRAL_SALES");
    expect(referralTypeFor("TRANSACTION_REWARD")).toBe("REFERRAL_TRANSACTION");
    expect(referralTypeFor("REFERRAL_SALES")).toBeNull();
    expect(referralTypeFor("REFERRAL_TRANSACTION")).toBeNull();
    expect(referralTypeFor("ADJUSTMENT")).toBeNull();
  });
});
