import "server-only";
import type { RoleKey } from "@prisma/client";
import { prisma } from "../db";
import { verifyPassword, hashPassword, passwordSchema } from "../auth/password";
import { rateLimit } from "../auth/rate-limit";
import { createSession, destroySession, getSession } from "../auth/session";
import { encryptMfaSecret, generateMfaSecret, mfaQrDataUrl, verifyTotp } from "../auth/mfa";
import { audit } from "../audit";
import { env } from "../env";
import { ADMIN_ROLES, type Actor } from "../rbac";
import { AppError, invalid } from "../errors";
import { normalizePhone } from "@/lib/utils";

const LOCK_AFTER = 5;
const LOCK_MINUTES = 15;
// Dummy hash so unknown accounts take the same time as wrong passwords (no user enumeration).
const DUMMY_HASH = "$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHRzb21lc2FsdA$Vq0GZpP2t1uLx0dN6V7m1t9I8bXvM3z3l8hX1QqXo2Y";

export type LoginResult = { next: "mfa_setup" | "mfa_verify" | "home"; home: string };

export function homeFor(roles: RoleKey[]): string {
  if (roles.some((r) => ADMIN_ROLES.includes(r))) return "/admin";
  if (roles.includes("AGENT")) return "/agent";
  if (roles.includes("MERCHANT")) return "/merchant";
  return "/";
}

export async function login(identifier: string, password: string, ip: string | null): Promise<LoginResult> {
  const id = identifier.trim().toLowerCase();
  await rateLimit(`login:id:${id}`, 10, 900);
  if (ip) await rateLimit(`login:ip:${ip}`, 50, 900);
  const phone = normalizePhone(id);
  const user = await prisma.user.findFirst({
    where: { deletedAt: null, OR: [{ email: id }, ...(phone ? [{ phone }] : [])] },
    include: { roles: { include: { role: true } } },
  });
  const generic = new AppError("UNAUTHENTICATED", "Email/nomor ponsel atau kata sandi salah.");
  if (!user) {
    await verifyPassword(DUMMY_HASH, password);
    throw generic;
  }
  if (user.lockedUntil && user.lockedUntil > new Date()) throw new AppError("RATE_LIMITED", `Akun terkunci sementara. Coba lagi setelah ${LOCK_MINUTES} menit.`);
  const ok = await verifyPassword(user.passwordHash, password);
  if (!ok) {
    const failed = user.failedLoginCount + 1;
    await prisma.user.update({ where: { id: user.id }, data: { failedLoginCount: failed >= LOCK_AFTER ? 0 : failed, lockedUntil: failed >= LOCK_AFTER ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null } });
    await audit(prisma, { kind: "user", userId: user.id, roles: [], ip }, { action: "auth.login_failed", entityType: "User", entityId: user.id });
    throw generic;
  }
  if (user.status !== "ACTIVE") throw new AppError("FORBIDDEN", "Akun dinonaktifkan. Hubungi administrator.");
  const roles = user.roles.map((r) => r.role.key);
  const isAdmin = roles.some((r) => ADMIN_ROLES.includes(r));
  const mfaRequired = isAdmin && env().ADMIN_MFA_REQUIRED;
  await prisma.user.update({ where: { id: user.id }, data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() } });
  await createSession(user.id, { mfaVerified: !mfaRequired });
  await audit(prisma, { kind: "user", userId: user.id, roles, ip }, { action: "auth.login", entityType: "User", entityId: user.id });
  if (mfaRequired) return { next: user.mfaEnabledAt ? "mfa_verify" : "mfa_setup", home: homeFor(roles) };
  return { next: "home", home: homeFor(roles) };
}

export async function logout() {
  await destroySession();
}

async function pendingMfaSession() {
  const s = await getSession();
  if (!s) throw new AppError("UNAUTHENTICATED", "Sesi berakhir. Silakan masuk kembali.");
  return s;
}

export async function beginMfaSetup() {
  const s = await pendingMfaSession();
  const user = await prisma.user.findUniqueOrThrow({ where: { id: s.user.id } });
  if (user.mfaEnabledAt) throw invalid("MFA sudah aktif.");
  const secret = generateMfaSecret();
  await prisma.user.update({ where: { id: user.id }, data: { mfaSecretEnc: encryptMfaSecret(secret) } });
  return { secret, qr: await mfaQrDataUrl(user.email, secret) };
}

export async function verifyMfa(code: string, ip: string | null) {
  const s = await pendingMfaSession();
  await rateLimit(`mfa:${s.user.id}`, 10, 900);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: s.user.id } });
  if (!user.mfaSecretEnc || !verifyTotp(user.mfaSecretEnc, code)) throw invalid("Kode autentikator salah.");
  if (!user.mfaEnabledAt) await prisma.user.update({ where: { id: user.id }, data: { mfaEnabledAt: new Date() } });
  // Rotate the session on privilege elevation.
  await destroySession();
  await createSession(user.id, { mfaVerified: true });
  await audit(prisma, { kind: "user", userId: user.id, roles: s.roles, ip }, { action: "auth.mfa_verified", entityType: "User", entityId: user.id });
  return homeFor(s.roles);
}

export async function changePassword(actor: Actor, current: string, next: string) {
  const parsed = passwordSchema.safeParse(next);
  if (!parsed.success) throw invalid(parsed.error.issues[0]!.message);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: actor.userId! } });
  if (!(await verifyPassword(user.passwordHash, current))) throw invalid("Kata sandi saat ini salah.");
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(next) } });
    await tx.session.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
    await audit(tx, actor, { action: "auth.password_change", entityType: "User", entityId: user.id });
  });
}

export async function setLocale(actor: Actor, locale: "id" | "en") {
  await prisma.user.update({ where: { id: actor.userId! }, data: { locale } });
}
