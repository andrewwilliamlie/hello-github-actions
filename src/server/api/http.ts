import "server-only";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AppError } from "../errors";
import { serialize } from "@/lib/money";
import { redact } from "../redact";
import { env } from "../env";

export function json(data: unknown, status = 200) {
  return NextResponse.json(serialize(data), { status, headers: { "Cache-Control": "no-store" } });
}

export function errorResponse(e: unknown) {
  if (e instanceof AppError) return json({ error: { code: e.code, message: e.message, details: e.details ?? null } }, e.status);
  if (e instanceof ZodError) return json({ error: { code: "VALIDATION", message: "Invalid request body", details: e.issues.map((i) => ({ path: i.path.join("."), message: i.message })) } }, 422);
  if (e instanceof SyntaxError) return json({ error: { code: "VALIDATION", message: "Malformed JSON" } }, 400);
  console.error("[api] unexpected", redact({ message: (e as Error)?.message }));
  return json({ error: { code: "INTERNAL", message: "Internal server error" } }, 500);
}

/**
 * CSRF defence for cookie-authenticated state-changing requests: the Origin (or Referer) must match
 * the app's own origin. API-key/webhook routes do not use cookies and skip this check.
 */
export function assertSameOrigin(req: Request) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return;
  const origin = req.headers.get("origin") ?? (req.headers.get("referer") ? new URL(req.headers.get("referer")!).origin : null);
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const allowed = new Set([new URL(env().APP_URL).origin, host ? `https://${host}` : "", host ? `http://${host}` : ""]);
  if (!origin || !allowed.has(origin)) throw new AppError("FORBIDDEN", "Cross-site request blocked (CSRF).");
}

export async function readJson<T = unknown>(req: Request, maxBytes = 2 * 1024 * 1024): Promise<T> {
  const text = await req.text();
  if (text.length > maxBytes) throw new AppError("VALIDATION", "Request body too large.");
  return (text ? JSON.parse(text) : {}) as T;
}
