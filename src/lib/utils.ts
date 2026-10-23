import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Normalize Indonesian mobile numbers to E.164 (+62…). Returns null if invalid. */
export function normalizePhone(input: string): string | null {
  const digits = input.replace(/[^\d+]/g, "");
  let d = digits.startsWith("+") ? digits.slice(1) : digits;
  if (d.startsWith("0")) d = "62" + d.slice(1);
  else if (d.startsWith("8")) d = "62" + d;
  if (!/^62\d{8,13}$/.test(d)) return null;
  return "+" + d;
}

export function maskPhone(e164: string): string {
  return e164.length > 6 ? `${e164.slice(0, 5)}****${e164.slice(-3)}` : "****";
}

export function maskEmail(email: string): string {
  const [u, d] = email.split("@");
  if (!d) return "****";
  return `${u.slice(0, 2)}***@${d}`;
}

export function initials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0] ?? "").join("").toUpperCase() || "?";
}

export function formatCode(prefix: string, n: number): string {
  return `${prefix}-${String(n).padStart(6, "0")}`;
}

export function normalizeName(s: string): string {
  return s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]/g, "");
}
