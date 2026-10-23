const SENSITIVE = /pass(word)?|otp|token|secret|authorization|cookie|accountnumber(?!last4|hash)|idnumber(?!last4|hash)|nik|mfa|codehash|keyhash/i;

/** Deep-copy with sensitive keys replaced. Used for audit payloads and logs. */
export function redact<T>(value: T, depth = 0): T {
  if (depth > 8 || value === null || value === undefined) return value;
  if (typeof value === "bigint") return value.toString() as unknown as T;
  if (value instanceof Date) return value.toISOString() as unknown as T;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1)) as unknown as T;
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE.test(k) ? "[REDACTED]" : redact(v, depth + 1);
    }
    return out as T;
  }
  return value;
}
