import type { RoleKey } from "@prisma/client";
import { prisma } from "@/server/db";
import type { Actor } from "@/server/rbac";
import { formatCode } from "@/lib/utils";
import { encryptField, blindIndex } from "@/server/crypto";
import { releaseCommissions } from "@/server/modules/commissions";

const TABLES_TO_KEEP = new Set(["_prisma_migrations"]);

export async function resetDb() {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`;
  const list = tables.filter((t) => !TABLES_TO_KEEP.has(t.tablename)).map((t) => `"${t.tablename}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE ${list} RESTART IDENTITY CASCADE`);
  for (const key of ["SUPER_ADMIN", "FINANCE_ADMIN", "OPERATIONS_ADMIN", "AGENT", "MERCHANT"] as RoleKey[]) {
    await prisma.role.create({ data: { key, name: key, description: key } });
  }
}

let seq = 0;
export async function makeAdmin(roles: RoleKey[], name = "admin"): Promise<Actor> {
  seq++;
  const roleRows = await prisma.role.findMany({ where: { key: { in: roles } } });
  const u = await prisma.user.create({
    data: { email: `${name}${seq}@test.local`, name: `${name} ${seq}`, passwordHash: "x", mfaEnabledAt: new Date(), roles: { create: roleRows.map((r) => ({ roleId: r.id })) } },
  });
  return { kind: "user", userId: u.id, roles, mfaVerified: true, ip: "127.0.0.1" };
}

/** Creates an ACTIVE agent with verified KYC + bank (bypassing UI flows) and returns its actor. */
export async function makeAgent(opts: { name?: string; referrerAgentId?: string; status?: "ACTIVE" | "PENDING" } = {}): Promise<Actor & { agentId: string }> {
  seq++;
  const role = await prisma.role.findUniqueOrThrow({ where: { key: "AGENT" } });
  const phone = `+62812${String(10000000 + seq).slice(-8)}`;
  const user = await prisma.user.create({
    data: { email: `agent${seq}@test.local`, phone, name: opts.name ?? `Agent ${seq}`, passwordHash: "x", phoneVerifiedAt: new Date(), roles: { create: { roleId: role.id } } },
  });
  const status = opts.status ?? "ACTIVE";
  const agent = await prisma.agent.create({
    data: {
      userId: user.id, agentCode: `TMP${seq}`, referralCode: `REF${String(seq).padStart(5, "0")}`, status, fullName: user.name, phone, email: user.email,
      addressLine: "Jl. Test 1", city: "Jakarta Selatan", province: "DKI Jakarta", approvedAt: status === "ACTIVE" ? new Date() : null,
    },
  });
  await prisma.agent.update({ where: { id: agent.id }, data: { agentCode: formatCode("HJA", agent.agentNumber) } });
  await prisma.wallet.create({ data: { agentId: agent.id } });
  await prisma.agentKYC.create({ data: { agentId: agent.id, status: "VERIFIED" } });
  const acct = `1234${String(seq).padStart(6, "0")}`;
  await prisma.agentBankAccount.create({
    data: { agentId: agent.id, bankCode: "014", bankName: "BCA", accountHolderName: user.name, accountNumberEnc: encryptField(acct), accountNumberHash: blindIndex(acct, "bank:014"), accountNumberLast4: acct.slice(-4), status: "VERIFIED", verifiedAt: new Date() },
  });
  if (opts.referrerAgentId) {
    const ref = await prisma.agent.findUniqueOrThrow({ where: { id: opts.referrerAgentId } });
    await prisma.agentReferral.create({
      data: { referrerAgentId: ref.id, recruitAgentId: agent.id, referralCodeUsed: ref.referralCode, status: status === "ACTIVE" ? "APPROVED" : "PENDING", approvedAt: status === "ACTIVE" ? new Date() : null, createdAt: new Date(Date.now() - 30 * 86_400_000) },
    });
  }
  return { kind: "user", userId: user.id, roles: ["AGENT"], agentId: agent.id, ip: "127.0.0.1" };
}

export async function makeProduct(sku = "A920PRO", price = 2_500_000n) {
  const p = await prisma.product.create({ data: { sku, name: `Product ${sku}`, slug: sku.toLowerCase(), category: "EDC_ANDROID", description: "Test product description", specs: [] } });
  await prisma.productPrice.create({ data: { productId: p.id, priceIdr: price, effectiveFrom: new Date("2020-01-01") } });
  return p;
}

export async function makeRule(data: {
  code: string; type: "SALES" | "TRANSACTION_REWARD" | "REFERRAL_SALES" | "REFERRAL_TRANSACTION"; productId?: string; fixedAmount?: bigint; rateBps?: number;
  effectiveFrom?: Date; effectiveTo?: Date | null; holdDays?: number; version?: number; requiresManualApproval?: boolean; deductFromRecruit?: boolean; conditions?: object; capAmount?: bigint;
}) {
  return prisma.commissionRule.create({
    data: {
      code: data.code, version: data.version ?? 1, type: data.type, status: "ACTIVE", name: data.code, productId: data.productId ?? null,
      fixedAmount: data.fixedAmount ?? null, rateBps: data.rateBps ?? null, capAmount: data.capAmount ?? null, effectiveFrom: data.effectiveFrom ?? new Date("2020-01-01"),
      effectiveTo: data.effectiveTo ?? null, holdDays: data.holdDays ?? 0, requiresManualApproval: data.requiresManualApproval ?? false,
      deductFromRecruit: data.deductFromRecruit ?? false, conditions: (data.conditions ?? {}) as object,
    },
  });
}

export async function addDevices(productId: string, serials: string[]) {
  for (const s of serials) await prisma.device.create({ data: { serialNumber: s, productId } });
}

export async function wallet(agentId: string) {
  return prisma.wallet.findUniqueOrThrow({ where: { agentId } });
}

export const release = (at?: Date) => releaseCommissions(undefined, at);

export const LEAD = (productId: string, n = 1) => ({
  businessName: `Toko Uji ${n}`, ownerName: `Pemilik ${n}`, phone: `0813${String(1000000 + n).padStart(8, "0")}`, businessType: "Retail",
  addressLine: "Jl. Merdeka No. 10", city: "Bandung", province: "Jawa Barat", productId,
});
