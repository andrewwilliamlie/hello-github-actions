import "server-only";
import type { RoleKey } from "@prisma/client";
import { prisma, isUniqueViolation } from "../db";
import { audit } from "../audit";
import { hashPassword, passwordSchema } from "../auth/password";
import { requirePermission, type Actor } from "../rbac";
import { duplicate, invalid, rule } from "../errors";

const ADMIN_ROLE_KEYS: RoleKey[] = ["SUPER_ADMIN", "FINANCE_ADMIN", "OPERATIONS_ADMIN"];

export async function createAdminUser(actor: Actor, input: { name: string; email: string; password: string; roles: RoleKey[] }) {
  requirePermission(actor, "user.manage");
  if (!input.roles.length || input.roles.some((r) => !ADMIN_ROLE_KEYS.includes(r))) throw invalid("Pilih peran admin.");
  const pw = passwordSchema.safeParse(input.password);
  if (!pw.success) throw invalid(pw.error.issues[0]!.message);
  const roles = await prisma.role.findMany({ where: { key: { in: input.roles } } });
  try {
    const user = await prisma.user.create({
      data: { name: input.name.trim(), email: input.email.trim().toLowerCase(), passwordHash: await hashPassword(input.password), roles: { create: roles.map((r) => ({ roleId: r.id, grantedBy: actor.userId })) } },
    });
    await audit(prisma, actor, { action: "user.create", entityType: "User", entityId: user.id, after: { email: user.email, roles: input.roles } });
    return user;
  } catch (e) {
    if (isUniqueViolation(e)) throw duplicate("Email sudah digunakan.");
    throw e;
  }
}

export async function setUserRoles(actor: Actor, userId: string, roleKeys: RoleKey[]) {
  requirePermission(actor, "user.manage");
  if (userId === actor.userId) throw rule("Tidak dapat mengubah peran akun sendiri.");
  if (roleKeys.some((r) => !ADMIN_ROLE_KEYS.includes(r))) throw invalid("Hanya peran admin yang dapat diatur di sini.");
  await prisma.$transaction(async (tx) => {
    const before = await tx.userRole.findMany({ where: { userId }, include: { role: true } });
    const adminRoleIds = (await tx.role.findMany({ where: { key: { in: ADMIN_ROLE_KEYS } } }));
    await tx.userRole.deleteMany({ where: { userId, roleId: { in: adminRoleIds.map((r) => r.id) } } });
    for (const r of adminRoleIds.filter((r) => roleKeys.includes(r.key))) await tx.userRole.create({ data: { userId, roleId: r.id, grantedBy: actor.userId } });
    await tx.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
    await audit(tx, actor, { action: "user.roles", entityType: "User", entityId: userId, before: { roles: before.map((b) => b.role.key) }, after: { roles: roleKeys } });
  });
}

export async function setUserDisabled(actor: Actor, userId: string, disabled: boolean) {
  requirePermission(actor, "user.manage");
  if (userId === actor.userId) throw rule("Tidak dapat menonaktifkan akun sendiri.");
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { status: disabled ? "DISABLED" : "ACTIVE" } });
    if (disabled) await tx.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
    await audit(tx, actor, { action: disabled ? "user.disable" : "user.enable", entityType: "User", entityId: userId });
  });
}

export async function resetUserMfa(actor: Actor, userId: string) {
  requirePermission(actor, "user.manage");
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { mfaSecretEnc: null, mfaEnabledAt: null } });
    await tx.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
    await audit(tx, actor, { action: "user.mfa_reset", entityType: "User", entityId: userId });
  });
}
