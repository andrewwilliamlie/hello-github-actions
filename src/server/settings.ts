import "server-only";
import { z } from "zod";
import { prisma, type Db } from "./db";
import { audit } from "./audit";
import { requirePermission, type Actor } from "./rbac";
import { invalid } from "./errors";

/**
 * Typed system settings with defaults. Values marked ASSUMPTION are configurable defaults chosen
 * for the MVP and documented in docs/assumptions.md — review before go-live.
 */
export const SETTINGS = {
  "sales.commissionMinIdr": { schema: z.number().int().min(0), default: 50_000, description: "Minimum per-SKU sales commission allowed by business rules (Rp)" },
  "sales.commissionMaxIdr": { schema: z.number().int().min(0), default: 150_000, description: "Maximum per-SKU sales commission allowed by business rules (Rp)" },
  "sales.ruleDateBasis": { schema: z.enum(["ORDER_DATE", "ACTIVATION_DATE"]), default: "ORDER_DATE", description: "Which date selects the sales commission rule version (ASSUMPTION)" },
  "withdrawal.minAmountIdr": { schema: z.number().int().min(1), default: 100_000, description: "Minimum withdrawal amount (Rp) (ASSUMPTION)" },
  "agent.requireKycForApproval": { schema: z.boolean(), default: true, description: "Agent approval requires verified KYC" },
  "kyc.retentionDays": { schema: z.number().int().min(30), default: 1825, description: "KYC document retention after account closure (days) (ASSUMPTION — legal review)" },
  "merchant.requiredDocuments": { schema: z.array(z.string()), default: ["OWNER_ID_CARD", "STORE_PHOTO"], description: "Documents required before an application can be submitted" },
  "reconciliation.requireSettlementReport": { schema: z.boolean(), default: true, description: "Rewards require a reconciled settlement report (recommended)" },
  "transaction.excludedTypes": { schema: z.array(z.string()), default: ["REFUND", "VOID", "TEST", "REVERSAL"], description: "Transaction types never rewarded" },
  "fraud.referralVelocityPerDay": { schema: z.number().int().min(1), default: 10, description: "Recruit registrations per referrer per day before a fraud flag" },
  "registration.maxPerIpPerDay": { schema: z.number().int().min(1), default: 5, description: "Registrations allowed per IP per day" },
  "notifications.whatsappEnabled": { schema: z.boolean(), default: false, description: "Send WhatsApp notifications to opted-in users (requires provider)" },
  "program.name": { schema: z.string().min(1), default: "Hausjo Agent Network", description: "Program display name" },
} as const;

export type SettingKey = keyof typeof SETTINGS;
export type SettingValue<K extends SettingKey> = z.infer<(typeof SETTINGS)[K]["schema"]>;

export async function getSetting<K extends SettingKey>(key: K, db: Db = prisma): Promise<SettingValue<K>> {
  const row = await db.systemSetting.findUnique({ where: { key } });
  const def = SETTINGS[key];
  if (!row) return def.default as SettingValue<K>;
  const parsed = def.schema.safeParse(row.value);
  return (parsed.success ? parsed.data : def.default) as SettingValue<K>;
}

export async function getAllSettings(db: Db = prisma) {
  const rows = await db.systemSetting.findMany();
  const map = new Map(rows.map((r) => [r.key, r]));
  return (Object.keys(SETTINGS) as SettingKey[]).map((key) => {
    const row = map.get(key);
    const parsed = row ? SETTINGS[key].schema.safeParse(row.value) : null;
    return {
      key,
      value: parsed?.success ? parsed.data : SETTINGS[key].default,
      isDefault: !row,
      description: SETTINGS[key].description,
      updatedAt: row?.updatedAt ?? null,
    };
  });
}

export async function updateSetting(actor: Actor, key: string, value: unknown) {
  requirePermission(actor, "settings.manage");
  if (!(key in SETTINGS)) throw invalid(`Pengaturan tidak dikenal: ${key}`);
  const def = SETTINGS[key as SettingKey];
  const parsed = def.schema.safeParse(value);
  if (!parsed.success) throw invalid(`Nilai tidak valid untuk ${key}: ${parsed.error.issues[0]?.message}`);
  const before = await getSetting(key as SettingKey);
  await prisma.$transaction(async (tx) => {
    await tx.systemSetting.upsert({
      where: { key },
      create: { key, value: parsed.data as never, description: def.description, updatedById: actor.userId },
      update: { value: parsed.data as never, updatedById: actor.userId },
    });
    await audit(tx, actor, { action: "settings.update", entityType: "SystemSetting", entityId: key, before: { value: before }, after: { value: parsed.data } });
  });
}
