import "server-only";
import { z } from "zod";
import type { CommissionType } from "@prisma/client";
import { prisma, withTx } from "../db";
import { audit } from "../audit";
import { getSetting } from "../settings";
import { validateSalesAmount } from "../commission/engine";
import { requireDifferentUser, requirePermission, type Actor } from "../rbac";
import { invalid, notFound, rule as ruleError } from "../errors";
import { toRupiah } from "@/lib/money";

export const ruleSchema = z
  .object({
    code: z.string().trim().toUpperCase().regex(/^[A-Z0-9:_-]{3,60}$/, "Kode aturan: huruf besar/angka/:_-"),
    type: z.enum(["SALES", "TRANSACTION_REWARD", "REFERRAL_SALES", "REFERRAL_TRANSACTION"]),
    name: z.string().trim().min(3).max(120),
    description: z.string().trim().max(1000).optional(),
    productId: z.string().optional().or(z.literal("").transform(() => undefined)),
    fixedAmount: z.string().optional().or(z.literal("").transform(() => undefined)),
    ratePercent: z.string().optional().or(z.literal("").transform(() => undefined)),
    capAmount: z.string().optional().or(z.literal("").transform(() => undefined)),
    transactionTypes: z.string().optional(),
    sources: z.string().optional(),
    merchantIds: z.string().optional(),
    excludeMerchantIds: z.string().optional(),
    minTransactionAmount: z.string().optional().or(z.literal("").transform(() => undefined)),
    priority: z.coerce.number().int().min(-100).max(100).default(0),
    effectiveFrom: z.coerce.date(),
    effectiveTo: z.coerce.date().optional().or(z.literal("").transform(() => undefined)),
    holdDays: z.coerce.number().int().min(0).max(180).default(0),
    requiresManualApproval: z.boolean().default(false),
    deductFromRecruit: z.boolean().default(false),
  });
export type RuleInput = z.input<typeof ruleSchema>;

const list = (s?: string) => (s ? s.split(/[,\n]/).map((x) => x.trim()).filter(Boolean) : undefined);

/** Percent string ("10" / "2.5") → basis points, exact (no float math). */
export function percentToBps(p: string): number {
  const m = p.trim().replace(",", ".").match(/^(\d{1,3})(?:\.(\d{1,2}))?$/);
  if (!m) throw invalid("Persentase tidak valid (maks. 2 desimal).");
  const bps = Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0"));
  if (bps > 10_000) throw invalid("Persentase maksimal 100%.");
  return bps;
}

/** Create a new DRAFT version of a rule family (code). Existing versions are never edited. */
export async function createRuleVersion(actor: Actor, raw: RuleInput) {
  requirePermission(actor, "rule.manage");
  const input = ruleSchema.parse(raw);
  const type = input.type as CommissionType;
  const fixedAmount = input.fixedAmount ? toRupiah(input.fixedAmount) : null;
  const rateBps = input.ratePercent ? percentToBps(input.ratePercent) : null;
  const capAmount = input.capAmount ? toRupiah(input.capAmount) : null;
  if ((type === "SALES" || type === "TRANSACTION_REWARD") && (fixedAmount === null || fixedAmount <= 0n)) throw invalid("Nominal tetap wajib diisi.");
  if ((type === "REFERRAL_SALES" || type === "REFERRAL_TRANSACTION") && rateBps === null) throw invalid("Persentase referral wajib diisi.");
  if (type === "SALES") {
    if (!input.productId) throw invalid("Aturan komisi penjualan harus terkait satu SKU.");
    const err = validateSalesAmount(fixedAmount!, BigInt(await getSetting("sales.commissionMinIdr")), BigInt(await getSetting("sales.commissionMaxIdr")));
    if (err) throw invalid(err);
  }
  if (input.effectiveTo && input.effectiveTo <= input.effectiveFrom) throw invalid("Tanggal akhir harus setelah tanggal mulai.");
  if (input.deductFromRecruit && !type.startsWith("REFERRAL")) throw invalid("Potongan dari rekrutan hanya untuk aturan referral.");
  const conditions = {
    ...(list(input.transactionTypes) ? { transactionTypes: list(input.transactionTypes)!.map((t) => t.toUpperCase()) } : {}),
    ...(list(input.sources) ? { sources: list(input.sources) } : {}),
    ...(list(input.merchantIds) ? { merchantIds: list(input.merchantIds) } : {}),
    ...(list(input.excludeMerchantIds) ? { excludeMerchantIds: list(input.excludeMerchantIds) } : {}),
    ...(input.minTransactionAmount ? { minTransactionAmount: toRupiah(input.minTransactionAmount).toString() } : {}),
  };
  return withTx(async (tx) => {
    const last = await tx.commissionRule.findFirst({ where: { code: input.code }, orderBy: { version: "desc" } });
    if (last && last.type !== type) throw invalid("Kode aturan sudah dipakai untuk jenis lain.");
    const r = await tx.commissionRule.create({
      data: {
        code: input.code, version: (last?.version ?? 0) + 1, type, status: "DRAFT", name: input.name, description: input.description,
        productId: type === "SALES" ? input.productId : null, fixedAmount, rateBps, capAmount, conditions, priority: input.priority,
        effectiveFrom: input.effectiveFrom, effectiveTo: input.effectiveTo ?? null, holdDays: input.holdDays,
        requiresManualApproval: input.requiresManualApproval, deductFromRecruit: input.deductFromRecruit, createdById: actor.userId,
      },
    });
    await audit(tx, actor, { action: "rule.create", entityType: "CommissionRule", entityId: r.id, after: r });
    return r;
  });
}

export async function submitRule(actor: Actor, ruleId: string) {
  requirePermission(actor, "rule.manage");
  return withTx(async (tx) => {
    const r = await tx.commissionRule.findUnique({ where: { id: ruleId } });
    if (!r) throw notFound("Aturan");
    if (r.status !== "DRAFT") throw ruleError("Hanya draf yang dapat diajukan.");
    await tx.commissionRule.update({ where: { id: ruleId }, data: { status: "PENDING_APPROVAL" } });
    await audit(tx, actor, { action: "rule.submit", entityType: "CommissionRule", entityId: ruleId });
  });
}

/** Checker approval (different user). Previous open-ended ACTIVE version of the family is closed at the new effectiveFrom. */
export async function decideRule(actor: Actor, ruleId: string, decision: "approve" | "reject") {
  requirePermission(actor, "rule.approve");
  return withTx(async (tx) => {
    const r = await tx.commissionRule.findUnique({ where: { id: ruleId } });
    if (!r) throw notFound("Aturan");
    if (r.status !== "PENDING_APPROVAL") throw ruleError("Aturan tidak menunggu persetujuan.");
    requireDifferentUser(r.createdById, actor, "Aturan komisi");
    if (decision === "reject") {
      await tx.commissionRule.update({ where: { id: ruleId }, data: { status: "REJECTED" } });
    } else {
      const prev = await tx.commissionRule.findMany({ where: { code: r.code, status: "ACTIVE", id: { not: r.id }, effectiveTo: null, effectiveFrom: { lt: r.effectiveFrom } } });
      for (const p of prev) await tx.commissionRule.update({ where: { id: p.id }, data: { effectiveTo: r.effectiveFrom } });
      await tx.commissionRule.update({ where: { id: ruleId }, data: { status: "ACTIVE", approvedById: actor.userId, approvedAt: new Date() } });
    }
    await audit(tx, actor, { action: `rule.${decision}`, entityType: "CommissionRule", entityId: ruleId });
  });
}

export async function retireRule(actor: Actor, ruleId: string) {
  requirePermission(actor, "rule.approve");
  return withTx(async (tx) => {
    const r = await tx.commissionRule.findUnique({ where: { id: ruleId } });
    if (!r) throw notFound("Aturan");
    if (r.status !== "ACTIVE") throw ruleError("Hanya aturan aktif yang dapat dipensiunkan.");
    const now = new Date();
    await tx.commissionRule.update({ where: { id: ruleId }, data: { status: "RETIRED", effectiveTo: r.effectiveTo && r.effectiveTo < now ? r.effectiveTo : now > r.effectiveFrom ? now : r.effectiveFrom } });
    await audit(tx, actor, { action: "rule.retire", entityType: "CommissionRule", entityId: ruleId });
  });
}

export async function listRules() {
  return prisma.commissionRule.findMany({ orderBy: [{ type: "asc" }, { code: "asc" }, { version: "desc" }], include: { product: { select: { name: true, sku: true } } } });
}
