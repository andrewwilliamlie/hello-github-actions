import type { RoleKey } from "@prisma/client";
import { AppError, forbidden } from "./errors";

export const PERMISSIONS = [
  "agent.view", "agent.approve", "agent.suspend", "kyc.review", "bank.verify", "referral.reassign",
  "merchant.view", "merchant.review", "merchant.suspend", "attribution.change",
  "order.view", "payment.verify", "order.refund",
  "device.manage", "device.activate",
  "product.manage", "rule.manage", "rule.approve",
  "transaction.view", "transaction.ingest", "import.manage", "reconciliation.manage",
  "commission.view", "commission.approve", "commission.reverse", "commission.release",
  "withdrawal.review", "payout.create", "payout.approve", "payout.record", "payout.confirm", "payout.export",
  "dispute.manage", "fraud.manage",
  "report.view", "report.export",
  "notification.outbox", "webhook.manage", "audit.view", "settings.manage", "user.manage",
  // self-service
  "self.agent", "self.merchant",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const ALL_ADMIN = PERMISSIONS.filter((p) => !p.startsWith("self."));

export const ROLE_PERMISSIONS: Record<RoleKey, readonly Permission[]> = {
  SUPER_ADMIN: ALL_ADMIN,
  FINANCE_ADMIN: [
    "agent.view", "bank.verify", "merchant.view", "order.view", "payment.verify", "order.refund",
    "transaction.view", "transaction.ingest", "import.manage", "reconciliation.manage",
    "commission.view", "commission.approve", "commission.reverse", "commission.release",
    "rule.manage", "withdrawal.review", "payout.create", "payout.approve", "payout.record", "payout.confirm", "payout.export",
    "dispute.manage", "fraud.manage", "report.view", "report.export", "notification.outbox",
  ],
  OPERATIONS_ADMIN: [
    "agent.view", "agent.approve", "agent.suspend", "kyc.review", "bank.verify",
    "merchant.view", "merchant.review", "merchant.suspend", "order.view", "payment.verify",
    "device.manage", "device.activate", "transaction.view", "import.manage", "reconciliation.manage",
    "commission.view", "dispute.manage", "fraud.manage", "report.view", "notification.outbox",
  ],
  AGENT: ["self.agent"],
  MERCHANT: ["self.merchant"],
};

export const ADMIN_ROLES: RoleKey[] = ["SUPER_ADMIN", "FINANCE_ADMIN", "OPERATIONS_ADMIN"];

export interface Actor {
  kind: "user" | "system" | "api";
  userId: string | null;
  roles: RoleKey[];
  agentId?: string | null;
  merchantId?: string | null;
  apiClientId?: string;
  apiSource?: string;
  mfaVerified?: boolean;
  ip?: string | null;
  name?: string;
}

export const SYSTEM_ACTOR: Actor = { kind: "system", userId: null, roles: ["SUPER_ADMIN"], mfaVerified: true, name: "system" };

export function permissionsOf(roles: RoleKey[]): Set<Permission> {
  const set = new Set<Permission>();
  for (const r of roles) for (const p of ROLE_PERMISSIONS[r]) set.add(p);
  return set;
}

export function isAdmin(actor: Actor): boolean {
  return actor.roles.some((r) => ADMIN_ROLES.includes(r));
}

export function can(actor: Actor, permission: Permission): boolean {
  if (actor.kind === "system") return true;
  if (actor.kind === "api") return false; // API clients use scopes, checked separately
  if (isAdmin(actor) && !actor.mfaVerified && process.env.ADMIN_MFA_REQUIRED !== "false") return false;
  return permissionsOf(actor.roles).has(permission);
}

export function requirePermission(actor: Actor, permission: Permission): void {
  if (actor.kind !== "system" && !actor.userId && actor.kind !== "api") throw new AppError("UNAUTHENTICATED", "Silakan masuk terlebih dahulu.");
  if (!can(actor, permission)) throw forbidden();
}

export function requireAgent(actor: Actor): string {
  if (!actor.agentId || !actor.roles.includes("AGENT")) throw forbidden("Fitur ini hanya untuk agen.");
  return actor.agentId;
}

export function requireMerchant(actor: Actor): string {
  if (!actor.merchantId || !actor.roles.includes("MERCHANT")) throw forbidden("Fitur ini hanya untuk merchant.");
  return actor.merchantId;
}

/** Maker-checker: the approver must be a different person than the maker. */
export function requireDifferentUser(makerId: string | null | undefined, checker: Actor, what: string): void {
  if (makerId && checker.userId === makerId) {
    throw new AppError("MAKER_CHECKER", `${what} harus disetujui oleh pengguna yang berbeda (maker-checker).`);
  }
}
