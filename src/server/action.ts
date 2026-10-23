import "server-only";
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { AppError } from "./errors";
import { requireActor } from "./auth/session";
import { serialize, type Serialized } from "@/lib/money";
import type { Actor } from "./rbac";
import { redact } from "./redact";

export type ActionResult<T = unknown> = { ok: true; data?: Serialized<T>; message?: string } | { ok: false; error: string; code?: string; fieldErrors?: Record<string, string> };

export function toActionError(e: unknown): ActionResult<never> {
  if (e instanceof AppError) return { ok: false, error: e.message, code: e.code };
  if (e instanceof ZodError) {
    const fieldErrors: Record<string, string> = {};
    for (const i of e.issues) fieldErrors[i.path.join(".")] ??= i.message;
    return { ok: false, error: e.issues[0]?.message ?? "Data tidak valid.", code: "VALIDATION", fieldErrors };
  }
  // Unexpected: log without sensitive data, never leak internals to the client.
  console.error("[action] unexpected error", redact({ message: (e as Error)?.message, stack: (e as Error)?.stack?.split("\n").slice(0, 4).join(" | ") }));
  return { ok: false, error: "Terjadi kesalahan sistem. Silakan coba lagi atau hubungi dukungan.", code: "INTERNAL" };
}

/** Run an authenticated server action with uniform error handling and cache revalidation. */
export async function runAction<T>(fn: (actor: Actor) => Promise<T>, opts: { revalidate?: string[]; message?: string } = {}): Promise<ActionResult<T>> {
  try {
    const actor = await requireActor();
    const data = await fn(actor);
    for (const p of opts.revalidate ?? []) revalidatePath(p, "layout");
    return { ok: true, data: data === undefined ? undefined : serialize(data), message: opts.message };
  } catch (e) {
    return toActionError(e);
  }
}

/** Unauthenticated variant (public forms such as registration). */
export async function runPublicAction<T>(fn: () => Promise<T>, opts: { message?: string } = {}): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    return { ok: true, data: data === undefined ? undefined : serialize(data), message: opts.message };
  } catch (e) {
    return toActionError(e);
  }
}

export function str(form: FormData, key: string): string {
  const v = form.get(key);
  return typeof v === "string" ? v : "";
}
