import "server-only";
import { z } from "zod";
import type { AgentStatus } from "@prisma/client";
import { prisma, withTx, isUniqueViolation, type Tx } from "../db";
import { blindIndex, encryptField, randomReferralCode } from "../crypto";
import { hashPassword, passwordSchema } from "../auth/password";
import { verifyOtp } from "../auth/otp";
import { rateLimit } from "../auth/rate-limit";
import { audit } from "../audit";
import { getSetting } from "../settings";
import { notifyRole, notifyUser } from "../notifications/notify";
import { raiseFraudFlag } from "./fraud";
import { storeUpload } from "../storage/files";
import { requireAgent, requirePermission, type Actor } from "../rbac";
import { AppError, duplicate, invalid, notFound, rule } from "../errors";
import { formatCode, normalizePhone } from "@/lib/utils";
import { addDays, startOfJakartaDay, businessDateString } from "@/lib/time";
import { AGENT_AGREEMENT_VERSION, PRIVACY_VERSION, agreementHash } from "./agreements";
import { BANKS } from "@/lib/banks";

const phoneField = z.string().transform((v, ctx) => {
  const p = normalizePhone(v);
  if (!p) ctx.addIssue({ code: "custom", message: "Nomor ponsel tidak valid" });
  return p ?? "";
});

export const registrationSchema = z.object({
  fullName: z.string().trim().min(3, "Nama minimal 3 karakter").max(100),
  phone: phoneField,
  email: z.string().trim().toLowerCase().email("Email tidak valid").max(200),
  password: passwordSchema,
  addressLine: z.string().trim().min(5, "Alamat terlalu pendek").max(300),
  city: z.string().trim().min(2).max(100),
  province: z.string().trim().min(2).max(100),
  postalCode: z.string().trim().regex(/^\d{5}$/, "Kode pos 5 digit").optional().or(z.literal("").transform(() => undefined)),
  bankCode: z.string().refine((c) => BANKS.some((b) => b.code === c), "Pilih bank"),
  accountHolderName: z.string().trim().min(3).max(100),
  accountNumber: z.string().trim().regex(/^\d{6,20}$/, "Nomor rekening 6–20 digit"),
  referralCode: z.string().trim().toUpperCase().max(16).optional().or(z.literal("").transform(() => undefined)),
  otpChallengeId: z.string().min(1, "Minta kode OTP terlebih dahulu"),
  otpCode: z.string().trim().regex(/^\d{6}$/, "Kode OTP 6 digit"),
  consentTerms: z.literal(true, { errorMap: () => ({ message: "Wajib menyetujui perjanjian agen" }) }),
  consentPrivacy: z.literal(true, { errorMap: () => ({ message: "Wajib menyetujui kebijakan privasi" }) }),
  consentDataProcessing: z.literal(true, { errorMap: () => ({ message: "Wajib menyetujui pemrosesan data pribadi" }) }),
  consentWhatsapp: z.boolean().default(false),
});
export type RegistrationInput = z.input<typeof registrationSchema>;

async function nextReferralCode(tx: Tx): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const code = randomReferralCode(8);
    if (!(await tx.agent.findUnique({ where: { referralCode: code } }))) return code;
  }
  throw new Error("Could not allocate referral code");
}

/**
 * Self-registration. Creates User(AGENT) + Agent(PENDING) + Wallet + bank account + consents +
 * agreement + optional referral link. Anti-duplicate: email, phone, bank account blind index.
 */
export async function registerAgent(raw: RegistrationInput, ctx: { ip: string | null; userAgent: string | null }) {
  const input = registrationSchema.parse(raw);
  if (ctx.ip) {
    const perDay = await getSetting("registration.maxPerIpPerDay");
    await rateLimit(`register:ip:${ctx.ip}`, perDay, 86_400);
  }

  // Duplicate checks before consuming the OTP.
  const [byEmail, byPhone] = await Promise.all([
    prisma.user.findUnique({ where: { email: input.email } }),
    prisma.user.findUnique({ where: { phone: input.phone } }),
  ]);
  if (byEmail || byPhone) throw duplicate("Email atau nomor ponsel sudah terdaftar. Silakan masuk.");

  let referrer: { id: string; phone: string; email: string; userId: string } | null = null;
  if (input.referralCode) {
    referrer = await prisma.agent.findFirst({ where: { referralCode: input.referralCode, status: "ACTIVE", deletedAt: null }, select: { id: true, phone: true, email: true, userId: true } });
    if (!referrer) throw invalid("Kode referral tidak ditemukan atau agen belum aktif.");
    if (referrer.phone === input.phone || referrer.email === input.email) throw invalid("Tidak dapat menggunakan kode referral sendiri.");
  }

  await verifyOtp(input.otpChallengeId, input.phone, "REGISTRATION", input.otpCode);
  const passwordHash = await hashPassword(input.password);
  const bankHash = blindIndex(input.accountNumber, `bank:${input.bankCode}`);
  const bank = BANKS.find((b) => b.code === input.bankCode)!;

  try {
    return await withTx(async (tx) => {
      const agentRole = await tx.role.findUniqueOrThrow({ where: { key: "AGENT" } });
      const user = await tx.user.create({
        data: { email: input.email, phone: input.phone, name: input.fullName, passwordHash, phoneVerifiedAt: new Date(), roles: { create: { roleId: agentRole.id } } },
      });
      const referralCode = await nextReferralCode(tx);
      const agent = await tx.agent.create({
        data: {
          userId: user.id, agentCode: `TMP-${user.id}`, referralCode, fullName: input.fullName, phone: input.phone, email: input.email,
          addressLine: input.addressLine, city: input.city, province: input.province, postalCode: input.postalCode,
          whatsappOptIn: input.consentWhatsapp, whatsappOptInAt: input.consentWhatsapp ? new Date() : null,
        },
      });
      await tx.agent.update({ where: { id: agent.id }, data: { agentCode: formatCode("HJA", agent.agentNumber) } });
      await tx.wallet.create({ data: { agentId: agent.id } });
      await tx.agentKYC.create({ data: { agentId: agent.id } });
      await tx.agentBankAccount.create({
        data: { agentId: agent.id, bankCode: bank.code, bankName: bank.name, accountHolderName: input.accountHolderName, accountNumberEnc: encryptField(input.accountNumber), accountNumberHash: bankHash, accountNumberLast4: input.accountNumber.slice(-4) },
      });
      await tx.agentAgreement.create({ data: { agentId: agent.id, agreementVersion: AGENT_AGREEMENT_VERSION, agreementHash: agreementHash(), ip: ctx.ip, userAgent: ctx.userAgent?.slice(0, 300) } });
      await tx.consent.createMany({
        data: [
          { userId: user.id, type: "TERMS", version: AGENT_AGREEMENT_VERSION, ip: ctx.ip },
          { userId: user.id, type: "PRIVACY", version: PRIVACY_VERSION, ip: ctx.ip },
          { userId: user.id, type: "DATA_PROCESSING", version: PRIVACY_VERSION, ip: ctx.ip },
          ...(input.consentWhatsapp ? [{ userId: user.id, type: "WHATSAPP" as const, version: PRIVACY_VERSION, ip: ctx.ip }] : []),
        ],
      });

      // Anti-farming signals
      const sharedBank = await tx.agentBankAccount.findFirst({ where: { accountNumberHash: bankHash, agentId: { not: agent.id }, status: { not: "ARCHIVED" } } });
      if (sharedBank) {
        await raiseFraudFlag(tx, { type: "SHARED_BANK_ACCOUNT", severity: "HIGH", agentId: agent.id, details: { otherAgentId: sharedBank.agentId }, dedupeKey: `shared-bank:${agent.id}:${sharedBank.agentId}` });
      }
      if (referrer) {
        if (sharedBank && sharedBank.agentId === referrer.id) {
          await raiseFraudFlag(tx, { type: "SELF_REFERRAL_SUSPECTED", severity: "HIGH", agentId: agent.id, details: { referrerId: referrer.id, signal: "same bank account" }, dedupeKey: `selfref:${agent.id}` });
        }
        await tx.agentReferral.create({ data: { referrerAgentId: referrer.id, recruitAgentId: agent.id, referralCodeUsed: input.referralCode! } });
        const today = startOfJakartaDay(businessDateString(new Date()));
        const velocity = await tx.agentReferral.count({ where: { referrerAgentId: referrer.id, createdAt: { gte: today } } });
        if (velocity > (await getSetting("fraud.referralVelocityPerDay", tx))) {
          await raiseFraudFlag(tx, { type: "REFERRAL_VELOCITY", severity: "MEDIUM", agentId: referrer.id, details: { registrationsToday: velocity }, dedupeKey: `velocity:${referrer.id}:${businessDateString(new Date())}` });
        }
      }
      await audit(tx, { kind: "user", userId: user.id, roles: ["AGENT"], ip: ctx.ip }, { action: "agent.register", entityType: "Agent", entityId: agent.id, after: { referralCode: input.referralCode ?? null } });
      await notifyUser(tx, user.id, "agent.registered", { name: input.fullName });
      await notifyRole(tx, ["OPERATIONS_ADMIN", "SUPER_ADMIN"], "admin.agent_registered", { name: input.fullName }, `/admin/agents/${agent.id}`);
      return { userId: user.id, agentId: agent.id };
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw duplicate("Email, nomor ponsel, atau rekening sudah terdaftar.");
    throw e;
  }
}

// ─────────────────────────────── Onboarding (agent self-service) ───────────────────────────────

export async function submitKyc(actor: Actor, input: { idNumber: string; idCard: { buffer: Buffer; filename: string }; selfie: { buffer: Buffer; filename: string } }) {
  const agentId = requireAgent(actor);
  const idNumber = input.idNumber.replace(/\s/g, "");
  if (!/^\d{16}$/.test(idNumber)) throw invalid("NIK harus 16 digit.");
  const kyc = await prisma.agentKYC.findUniqueOrThrow({ where: { agentId } });
  if (kyc.status === "VERIFIED") throw rule("KYC sudah terverifikasi.");
  const idHash = blindIndex(idNumber, "nik");
  const other = await prisma.agentKYC.findFirst({ where: { idNumberHash: idHash, agentId: { not: agentId } } });
  if (other) {
    await raiseFraudFlag(prisma, { type: "DUPLICATE_ID_NUMBER", severity: "HIGH", agentId, details: { otherAgentId: other.agentId }, dedupeKey: `dup-nik:${agentId}:${other.agentId}` });
    throw duplicate("NIK sudah digunakan oleh akun lain. Hubungi dukungan Hausjo.");
  }
  const retentionDays = await getSetting("kyc.retentionDays");
  const retentionUntil = addDays(new Date(), retentionDays);
  const idCard = await storeUpload({ ...input.idCard, purpose: "KYC_ID_CARD", allowed: ["jpeg", "png", "webp", "pdf"], uploadedById: actor.userId, ownerAgentId: agentId, retentionUntil });
  const selfie = await storeUpload({ ...input.selfie, purpose: "KYC_SELFIE", allowed: ["jpeg", "png", "webp"], uploadedById: actor.userId, ownerAgentId: agentId, retentionUntil });
  await prisma.$transaction(async (tx) => {
    await tx.agentKYC.update({
      where: { agentId },
      data: { idNumberEnc: encryptField(idNumber), idNumberHash: idHash, idNumberLast4: idNumber.slice(-4), idCardFileId: idCard.id, selfieFileId: selfie.id, status: "SUBMITTED", submittedAt: new Date(), rejectionReason: null, retentionUntil },
    });
    await audit(tx, actor, { action: "kyc.submit", entityType: "AgentKYC", entityId: agentId });
  });
}

export async function addBankAccount(actor: Actor, input: { bankCode: string; accountHolderName: string; accountNumber: string }) {
  const agentId = requireAgent(actor);
  const bank = BANKS.find((b) => b.code === input.bankCode);
  if (!bank) throw invalid("Bank tidak dikenal.");
  if (!/^\d{6,20}$/.test(input.accountNumber)) throw invalid("Nomor rekening 6–20 digit.");
  const hash = blindIndex(input.accountNumber, `bank:${bank.code}`);
  return withTx(async (tx) => {
    const shared = await tx.agentBankAccount.findFirst({ where: { accountNumberHash: hash, agentId: { not: agentId }, status: { not: "ARCHIVED" } } });
    if (shared) await raiseFraudFlag(tx, { type: "SHARED_BANK_ACCOUNT", severity: "HIGH", agentId, details: { otherAgentId: shared.agentId }, dedupeKey: `shared-bank:${agentId}:${shared.agentId}` });
    // Only one live account: archive previous non-archived accounts (open withdrawals keep their snapshot).
    await tx.agentBankAccount.updateMany({ where: { agentId, status: { in: ["PENDING_VERIFICATION", "REJECTED", "VERIFIED"] } }, data: { status: "ARCHIVED" } });
    const acc = await tx.agentBankAccount.create({
      data: { agentId, bankCode: bank.code, bankName: bank.name, accountHolderName: input.accountHolderName.trim(), accountNumberEnc: encryptField(input.accountNumber), accountNumberHash: hash, accountNumberLast4: input.accountNumber.slice(-4) },
    });
    await audit(tx, actor, { action: "bank.add", entityType: "AgentBankAccount", entityId: acc.id, after: { bank: bank.code, last4: acc.accountNumberLast4 } });
    return acc;
  });
}

export async function acceptAgreement(actor: Actor, ctx: { ip: string | null; userAgent: string | null }) {
  const agentId = requireAgent(actor);
  await prisma.agentAgreement.upsert({
    where: { agentId_agreementVersion: { agentId, agreementVersion: AGENT_AGREEMENT_VERSION } },
    create: { agentId, agreementVersion: AGENT_AGREEMENT_VERSION, agreementHash: agreementHash(), ip: ctx.ip, userAgent: ctx.userAgent?.slice(0, 300) },
    update: {},
  });
}

export async function setWhatsappOptIn(actor: Actor, optIn: boolean) {
  const agentId = requireAgent(actor);
  await prisma.$transaction(async (tx) => {
    await tx.agent.update({ where: { id: agentId }, data: { whatsappOptIn: optIn, whatsappOptInAt: optIn ? new Date() : null } });
    if (optIn) await tx.consent.create({ data: { userId: actor.userId!, type: "WHATSAPP", version: PRIVACY_VERSION, ip: actor.ip } });
    else await tx.consent.updateMany({ where: { userId: actor.userId!, type: "WHATSAPP", withdrawnAt: null }, data: { withdrawnAt: new Date() } });
    await audit(tx, actor, { action: optIn ? "consent.whatsapp.grant" : "consent.whatsapp.withdraw", entityType: "Agent", entityId: agentId });
  });
}

export async function onboardingChecklist(agentId: string) {
  const a = await prisma.agent.findUniqueOrThrow({
    where: { id: agentId },
    include: { kyc: true, bankAccounts: { where: { status: { not: "ARCHIVED" } }, orderBy: { createdAt: "desc" }, take: 1 }, agreements: { where: { agreementVersion: AGENT_AGREEMENT_VERSION } }, user: true },
  });
  const bank = a.bankAccounts[0] ?? null;
  return {
    status: a.status,
    items: [
      { key: "phone", done: !!a.user.phoneVerifiedAt },
      { key: "profile", done: !!(a.addressLine && a.city && a.province) },
      { key: "agreement", done: a.agreements.length > 0 },
      { key: "kyc", done: a.kyc?.status === "VERIFIED", state: a.kyc?.status ?? "NOT_SUBMITTED", reason: a.kyc?.rejectionReason },
      { key: "bank", done: bank?.status === "VERIFIED", state: bank?.status ?? "NONE", reason: bank?.rejectionReason },
      { key: "approval", done: a.status === "ACTIVE", state: a.status },
    ],
    bank,
    kyc: a.kyc,
  };
}

// ─────────────────────────────── Admin review ───────────────────────────────

export async function reviewKyc(actor: Actor, agentId: string, decision: "VERIFIED" | "REJECTED", reason?: string) {
  requirePermission(actor, "kyc.review");
  return withTx(async (tx) => {
    const kyc = await tx.agentKYC.findUnique({ where: { agentId }, include: { agent: true } });
    if (!kyc) throw notFound("KYC");
    if (kyc.status !== "SUBMITTED") throw rule("KYC belum diajukan atau sudah ditinjau.");
    if (decision === "REJECTED" && !reason) throw invalid("Alasan penolakan wajib diisi.");
    await tx.agentKYC.update({ where: { agentId }, data: { status: decision, reviewedAt: new Date(), reviewedById: actor.userId, rejectionReason: decision === "REJECTED" ? reason : null } });
    await audit(tx, actor, { action: `kyc.${decision.toLowerCase()}`, entityType: "AgentKYC", entityId: agentId, after: { reason } });
    await notifyUser(tx, kyc.agent.userId, decision === "VERIFIED" ? "kyc.verified" : "kyc.rejected", { reason: reason ?? "" }, "/agent/onboarding");
  });
}

export async function reviewBankAccount(actor: Actor, bankAccountId: string, decision: "VERIFIED" | "REJECTED", reason?: string) {
  requirePermission(actor, "bank.verify");
  return withTx(async (tx) => {
    const acc = await tx.agentBankAccount.findUnique({ where: { id: bankAccountId }, include: { agent: true } });
    if (!acc) throw notFound("Rekening");
    if (acc.status !== "PENDING_VERIFICATION") throw rule("Rekening tidak menunggu verifikasi.");
    if (decision === "REJECTED" && !reason) throw invalid("Alasan penolakan wajib diisi.");
    await tx.agentBankAccount.update({ where: { id: acc.id }, data: { status: decision, verifiedAt: decision === "VERIFIED" ? new Date() : null, verifiedById: actor.userId, rejectionReason: reason ?? null } });
    await audit(tx, actor, { action: `bank.${decision.toLowerCase()}`, entityType: "AgentBankAccount", entityId: acc.id, after: { reason } });
    if (decision === "VERIFIED") await notifyUser(tx, acc.agent.userId, "bank.verified", { bank: acc.bankName, last4: acc.accountNumberLast4 }, "/agent/wallet");
  });
}

export async function setAgentStatus(actor: Actor, agentId: string, next: AgentStatus, reason?: string) {
  requirePermission(actor, next === "SUSPENDED" ? "agent.suspend" : "agent.approve");
  return withTx(async (tx) => {
    const a = await tx.agent.findUnique({ where: { id: agentId }, include: { kyc: true, user: true } });
    if (!a) throw notFound("Agen");
    const allowed: Record<AgentStatus, AgentStatus[]> = {
      PENDING: ["ACTIVE", "REJECTED"],
      ACTIVE: ["SUSPENDED"],
      SUSPENDED: ["ACTIVE"],
      REJECTED: [],
    };
    if (!allowed[a.status].includes(next)) throw rule(`Tidak dapat mengubah status dari ${a.status} ke ${next}.`);
    if (next !== "ACTIVE" && !reason) throw invalid("Alasan wajib diisi.");
    if (next === "ACTIVE" && a.status === "PENDING") {
      if (!a.user.phoneVerifiedAt) throw rule("Nomor ponsel belum terverifikasi.");
      if ((await getSetting("agent.requireKycForApproval", tx)) && a.kyc?.status !== "VERIFIED") throw rule("KYC harus terverifikasi sebelum persetujuan.");
    }
    await tx.agent.update({
      where: { id: agentId },
      data: { status: next, statusReason: reason ?? null, ...(next === "ACTIVE" && a.status === "PENDING" ? { approvedAt: new Date(), approvedById: actor.userId } : {}) },
    });
    if (a.status === "PENDING") {
      await tx.agentReferral.updateMany({ where: { recruitAgentId: agentId, endedAt: null, status: "PENDING" }, data: next === "ACTIVE" ? { status: "APPROVED", approvedAt: new Date() } : { status: "REJECTED" } });
    }
    await audit(tx, actor, { action: `agent.status.${next.toLowerCase()}`, entityType: "Agent", entityId: agentId, before: { status: a.status }, after: { status: next, reason } });
    const key = next === "ACTIVE" ? "agent.approved" : next === "REJECTED" ? "agent.rejected" : "agent.suspended";
    if (a.status !== "SUSPENDED" || next !== "ACTIVE") {
      await notifyUser(tx, a.userId, key, { name: a.fullName, agentCode: a.agentCode, referralCode: a.referralCode, reason: reason ?? "" }, "/agent");
    }
  });
}

// ─────────────────────────────── Referral graph ───────────────────────────────

/** Walk up the referral chain from `startAgentId`; true if `targetAgentId` is found (cycle). */
export async function isAncestor(db: Tx | typeof prisma, startAgentId: string, targetAgentId: string, maxDepth = 50): Promise<boolean> {
  let current: string | null = startAgentId;
  const seen = new Set<string>();
  for (let i = 0; i < maxDepth && current; i++) {
    if (current === targetAgentId) return true;
    if (seen.has(current)) return true;
    seen.add(current);
    const link: { referrerAgentId: string } | null = await db.agentReferral.findFirst({ where: { recruitAgentId: current, endedAt: null }, select: { referrerAgentId: true } });
    current = link?.referrerAgentId ?? null;
  }
  return false;
}

/**
 * Privileged, audited referrer reassignment (SUPER_ADMIN). Never retroactive: the old link is
 * ended now; commissions already created keep their original referrer.
 */
export async function reassignReferrer(actor: Actor, recruitAgentId: string, newReferrerAgentId: string | null, reason: string) {
  requirePermission(actor, "referral.reassign");
  if (reason.trim().length < 10) throw invalid("Alasan wajib diisi (min. 10 karakter).");
  return withTx(async (tx) => {
    const recruit = await tx.agent.findUnique({ where: { id: recruitAgentId } });
    if (!recruit) throw notFound("Agen");
    const current = await tx.agentReferral.findFirst({ where: { recruitAgentId, endedAt: null } });
    if (newReferrerAgentId) {
      if (newReferrerAgentId === recruitAgentId) throw rule("Agen tidak dapat mereferensikan dirinya sendiri.");
      const ref = await tx.agent.findUnique({ where: { id: newReferrerAgentId } });
      if (!ref || ref.status !== "ACTIVE") throw rule("Referrer baru harus agen aktif.");
      if (await isAncestor(tx, newReferrerAgentId, recruitAgentId)) throw rule("Penugasan ini akan membuat hubungan referral melingkar.");
    }
    const now = new Date();
    if (current) await tx.agentReferral.update({ where: { id: current.id }, data: { endedAt: now, endedReason: reason, status: current.status === "APPROVED" ? "VOID" : current.status } });
    let created = null;
    if (newReferrerAgentId) {
      const ref = await tx.agent.findUniqueOrThrow({ where: { id: newReferrerAgentId } });
      created = await tx.agentReferral.create({
        data: { referrerAgentId: newReferrerAgentId, recruitAgentId, referralCodeUsed: ref.referralCode, status: recruit.status === "ACTIVE" ? "APPROVED" : "PENDING", approvedAt: recruit.status === "ACTIVE" ? now : null, createdById: actor.userId },
      });
    }
    await audit(tx, actor, { action: "referral.reassign", entityType: "Agent", entityId: recruitAgentId, before: { referrer: current?.referrerAgentId ?? null }, after: { referrer: newReferrerAgentId, reason } });
    return created;
  });
}

export async function getAgentForActor(actor: Actor, agentId: string) {
  if (actor.agentId === agentId) return prisma.agent.findUnique({ where: { id: agentId } });
  requirePermission(actor, "agent.view");
  const a = await prisma.agent.findUnique({ where: { id: agentId } });
  if (!a) throw new AppError("NOT_FOUND", "Agen tidak ditemukan.");
  return a;
}
