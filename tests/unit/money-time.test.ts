import { describe, expect, it } from "vitest";
import { applyBps, formatRupiah, serialize, sumRupiah, toRupiah } from "@/lib/money";
import { businessDate, businessDateString, startOfJakartaDay } from "@/lib/time";
import { normalizePhone } from "@/lib/utils";

describe("money (integer Rupiah, never floats)", () => {
  it("parses integers and Rupiah strings", () => {
    expect(toRupiah(500)).toBe(500n);
    expect(toRupiah("Rp1.250.000")).toBe(1_250_000n);
    expect(toRupiah("150000,00")).toBe(150_000n);
  });
  it("rejects fractions and garbage", () => {
    expect(() => toRupiah(1.5)).toThrow();
    expect(() => toRupiah("12.5x")).toThrow();
    expect(() => toRupiah(Number.MAX_SAFE_INTEGER + 2)).toThrow();
  });
  it("applies basis points with floor rounding", () => {
    expect(applyBps(100_000n, 1000)).toBe(10_000n);
    expect(applyBps(500n, 500)).toBe(25n);
    expect(applyBps(999n, 1000)).toBe(99n); // 99.9 → 99
    expect(applyBps(1n, 1)).toBe(0n);
    expect(() => applyBps(100n, 10_001)).toThrow();
    expect(() => applyBps(100n, 2.5)).toThrow();
    expect(() => applyBps(-1n, 100)).toThrow();
  });
  it("formats beyond 2^53 exactly", () => {
    expect(formatRupiah(123_456_789_012_345_678n)).toBe("Rp123.456.789.012.345.678");
    expect(formatRupiah(-1500n)).toBe("-Rp1.500");
    expect(formatRupiah(null)).toBe("Rp0");
  });
  it("sums and serializes bigint", () => {
    expect(sumRupiah([1n, 2n, 3n])).toBe(6n);
    expect(serialize({ a: 1n, b: [2n] })).toEqual({ a: "1", b: ["2"] });
  });
});

describe("Asia/Jakarta business dates", () => {
  it("rolls over at 17:00 UTC (00:00 WIB)", () => {
    expect(businessDateString(new Date("2026-10-22T16:59:59Z"))).toBe("2026-10-22");
    expect(businessDateString(new Date("2026-10-22T17:00:00Z"))).toBe("2026-10-23");
    expect(businessDate(new Date("2026-10-22T17:00:00Z")).toISOString()).toBe("2026-10-23T00:00:00.000Z");
  });
  it("computes the instant a Jakarta day starts", () => {
    expect(startOfJakartaDay("2026-10-23").toISOString()).toBe("2026-10-22T17:00:00.000Z");
  });
});

describe("phone normalization", () => {
  it("normalizes Indonesian numbers to E.164", () => {
    expect(normalizePhone("0812-3456-7890")).toBe("+6281234567890");
    expect(normalizePhone("+62 812 3456 7890")).toBe("+6281234567890");
    expect(normalizePhone("81234567890")).toBe("+6281234567890");
    expect(normalizePhone("12345")).toBeNull();
  });
});
