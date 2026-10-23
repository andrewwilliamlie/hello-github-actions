// Money helpers. All Rupiah amounts are whole-Rupiah `bigint`. Never use floating point for money.

export type Rupiah = bigint;

/** Parse an integer Rupiah amount from number | string | bigint. Throws on fractions/NaN. */
export function toRupiah(value: number | string | bigint): Rupiah {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) throw new RangeError(`Invalid Rupiah amount: ${value}`);
    return BigInt(value);
  }
  const cleaned = value.trim().replace(/^Rp\s?/i, "").replace(/[.\s]/g, "").replace(/,00$/, "");
  if (!/^-?\d+$/.test(cleaned)) throw new RangeError(`Invalid Rupiah amount: ${value}`);
  return BigInt(cleaned);
}

/** amount × bps / 10 000, rounded down (in the payer's favour, documented rule). */
export function applyBps(amount: Rupiah, bps: number): Rupiah {
  if (!Number.isInteger(bps) || bps < 0 || bps > 10_000) throw new RangeError(`Invalid basis points: ${bps}`);
  if (amount < 0n) throw new RangeError("applyBps expects a non-negative amount");
  return (amount * BigInt(bps)) / 10_000n;
}

export function minRupiah(...values: Rupiah[]): Rupiah {
  return values.reduce((a, b) => (b < a ? b : a));
}

export function maxRupiah(...values: Rupiah[]): Rupiah {
  return values.reduce((a, b) => (b > a ? b : a));
}

export function sumRupiah(values: Iterable<Rupiah>): Rupiah {
  let total = 0n;
  for (const v of values) total += v;
  return total;
}

/** "Rp1.234.567" — Indonesian grouping, no decimals. Works for bigint beyond 2^53. */
export function formatRupiah(value: Rupiah | number | string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "Rp0";
  const v = typeof value === "bigint" ? value : toRupiah(value as number | string);
  const negative = v < 0n;
  const digits = (negative ? -v : v).toString();
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${negative ? "-" : ""}Rp${grouped}`;
}

/** Compact "Rp1,2 jt" style for chart axes. Display only. */
export function formatRupiahCompact(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1e9) return `Rp${(value / 1e9).toLocaleString("id-ID", { maximumFractionDigits: 1 })} M`;
  if (abs >= 1e6) return `Rp${(value / 1e6).toLocaleString("id-ID", { maximumFractionDigits: 1 })} jt`;
  if (abs >= 1e3) return `Rp${(value / 1e3).toLocaleString("id-ID", { maximumFractionDigits: 0 })} rb`;
  return `Rp${value}`;
}

export function formatBps(bps: number): string {
  return `${(bps / 100).toLocaleString("id-ID", { maximumFractionDigits: 2 })}%`;
}

/** Recursively convert bigint → string so values can cross the server/client boundary or JSON. */
export function serialize<T>(value: T): Serialized<T> {
  return JSON.parse(JSON.stringify(value, (_k, v) => (typeof v === "bigint" ? v.toString() : v))) as Serialized<T>;
}

export type Serialized<T> = T extends bigint
  ? string
  : T extends Date
    ? string
    : T extends Array<infer U>
      ? Serialized<U>[]
      : T extends object
        ? { [K in keyof T]: Serialized<T[K]> }
        : T;
