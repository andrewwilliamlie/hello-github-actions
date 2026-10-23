// Asia/Jakarta (WIB, UTC+7, no DST) helpers.
export const TIMEZONE = "Asia/Jakarta";
const OFFSET_MS = 7 * 60 * 60 * 1000;

/** Calendar date in Jakarta, as a UTC-midnight Date (what Postgres `date` columns expect). */
export function businessDate(at: Date): Date {
  const shifted = new Date(at.getTime() + OFFSET_MS);
  return new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()));
}

/** "2026-10-23" in Jakarta. */
export function businessDateString(at: Date): string {
  return businessDate(at).toISOString().slice(0, 10);
}

/** Instant at which the given Jakarta calendar day starts ("2026-10-23" → 2026-10-22T17:00Z). */
export function startOfJakartaDay(date: string | Date): Date {
  const d = typeof date === "string" ? new Date(`${date}T00:00:00Z`) : businessDate(date);
  return new Date(d.getTime() - OFFSET_MS);
}

export function addDays(at: Date, days: number): Date {
  return new Date(at.getTime() + days * 86_400_000);
}

export function parseDateOnly(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new RangeError(`Invalid date: ${value}`);
  return new Date(`${value}T00:00:00Z`);
}

export function formatDateTime(value: Date | string | null | undefined, locale = "id"): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "id-ID", {
    timeZone: TIMEZONE, day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  }).format(d) + " WIB";
}

export function formatDate(value: Date | string | null | undefined, locale = "id"): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "id-ID", {
    timeZone: TIMEZONE, day: "2-digit", month: "short", year: "numeric",
  }).format(d);
}

/** For `@db.Date` values (UTC midnight) — format without timezone shifting. */
export function formatBusinessDate(value: Date | string | null | undefined, locale = "id"): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "id-ID", {
    timeZone: "UTC", day: "2-digit", month: "short", year: "numeric",
  }).format(d);
}
