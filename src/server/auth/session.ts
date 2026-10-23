import "server-only";
import { cookies, headers } from "next/headers";
import type { RoleKey } from "@prisma/client";
import { prisma } from "../db";
import { env } from "../env";
import { randomToken, sha256Hex } from "../crypto";
import { ADMIN_ROLES, type Actor } from "../rbac";
import { AppError } from "../errors";

export const SESSION_COOKIE = "hj_session";
const ABSOLUTE_MS = 12 * 3600_000;
const IDLE_MS = 2 * 3600_000;

function secureCookies(): boolean {
  const s = env().SECURE_COOKIES;
  if (s === "auto") return env().NODE_ENV === "production";
  return s === "true";
}

export async function clientIp(): Promise<string | null> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
}

export async function createSession(userId: string, opts: { mfaVerified: boolean }): Promise<void> {
  const token = randomToken(32);
  const h = await headers();
  await prisma.session.create({
    data: {
      tokenHash: sha256Hex(token),
      userId,
      mfaVerified: opts.mfaVerified,
      ip: await clientIp(),
      userAgent: h.get("user-agent")?.slice(0, 300) ?? null,
      expiresAt: new Date(Date.now() + ABSOLUTE_MS),
    },
  });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: secureCookies(), path: "/", maxAge: ABSOLUTE_MS / 1000 });
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await prisma.session.updateMany({ where: { tokenHash: sha256Hex(token) }, data: { revokedAt: new Date() } });
  jar.delete(SESSION_COOKIE);
}

export interface SessionInfo {
  sessionId: string;
  user: { id: string; name: string; email: string; locale: string; mfaEnabled: boolean };
  roles: RoleKey[];
  agentId: string | null;
  agentStatus: string | null;
  merchantId: string | null;
  mfaVerified: boolean;
}

async function loadSession(token: string): Promise<SessionInfo | null> {
  const s = await prisma.session.findUnique({
    where: { tokenHash: sha256Hex(token) },
    include: { user: { include: { roles: { include: { role: true } }, agent: { select: { id: true, status: true } }, merchant: { select: { id: true } } } } },
  });
  if (!s || s.revokedAt || s.expiresAt < new Date() || Date.now() - s.lastSeenAt.getTime() > IDLE_MS) return null;
  if (s.user.status !== "ACTIVE" || s.user.deletedAt) return null;
  if (Date.now() - s.lastSeenAt.getTime() > 60_000) {
    await prisma.session.update({ where: { id: s.id }, data: { lastSeenAt: new Date() } });
  }
  return {
    sessionId: s.id,
    user: { id: s.user.id, name: s.user.name, email: s.user.email, locale: s.user.locale, mfaEnabled: !!s.user.mfaEnabledAt },
    roles: s.user.roles.map((r) => r.role.key),
    agentId: s.user.agent?.id ?? null,
    agentStatus: s.user.agent?.status ?? null,
    merchantId: s.user.merchant?.id ?? null,
    mfaVerified: s.mfaVerified,
  };
}

export async function getSession(): Promise<SessionInfo | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return loadSession(token);
}

export function actorFromSession(s: SessionInfo, ip: string | null): Actor {
  return {
    kind: "user",
    userId: s.user.id,
    roles: s.roles,
    agentId: s.agentId,
    merchantId: s.merchantId,
    mfaVerified: s.mfaVerified || !s.roles.some((r) => ADMIN_ROLES.includes(r)) || !env().ADMIN_MFA_REQUIRED,
    ip,
    name: s.user.name,
  };
}

/** Current actor or throws UNAUTHENTICATED. */
export async function requireActor(): Promise<Actor> {
  const s = await getSession();
  if (!s) throw new AppError("UNAUTHENTICATED", "Sesi Anda telah berakhir. Silakan masuk kembali.");
  const actor = actorFromSession(s, await clientIp());
  if (!actor.mfaVerified) throw new AppError("MFA_REQUIRED", "Verifikasi MFA diperlukan.");
  return actor;
}
