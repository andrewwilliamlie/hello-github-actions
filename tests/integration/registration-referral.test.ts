import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { sendOtp } from "@/server/auth/otp";
import { registerAgent, reassignReferrer, setAgentStatus, reviewKyc, type RegistrationInput } from "@/server/modules/agents";
import { addDevices, makeAdmin, makeAgent, makeProduct, makeRule, release, resetDb, wallet } from "../support/fixtures";
import { onboardAndActivate } from "../support/flows";
import { addDays } from "@/lib/time";
import type { Actor } from "@/server/rbac";
import { decryptField } from "@/server/crypto";

let n = 0;
async function registration(over: Partial<RegistrationInput> = {}): Promise<RegistrationInput> {
  n++;
  const phone = (over.phone as string) ?? `08129${String(100000 + n).padStart(6, "0")}`;
  const normalized = "+62" + phone.replace(/^0/, "");
  await prisma.otpChallenge.deleteMany({ where: { destination: normalized } }); // bypass resend cooldown between tests
  const otp = await sendOtp("REGISTRATION", normalized, { ip: null });
  return {
    fullName: `Calon Agen ${n}`, phone, email: `calon${n}@test.local`, password: "Rahasia12345", addressLine: "Jl. Mawar No. 1", city: "Bandung", province: "Jawa Barat",
    bankCode: "014", accountHolderName: `Calon Agen ${n}`, accountNumber: `55${String(1000000 + n)}`, otpChallengeId: otp.challengeId, otpCode: otp.mockCode!,
    consentTerms: true, consentPrivacy: true, consentDataProcessing: true, consentWhatsapp: false, ...over,
  } as RegistrationInput;
}

describe("agent registration", () => {
  let ops: Actor;
  beforeEach(async () => {
    await resetDb();
    ops = await makeAdmin(["OPERATIONS_ADMIN"], "ops");
  });

  it("creates a PENDING agent with permanent IDs, wallet, consents and agreement — and no commission", async () => {
    const { agentId } = await registerAgent(await registration(), { ip: "10.0.0.1", userAgent: "vitest" });
    const a = await prisma.agent.findUniqueOrThrow({ where: { id: agentId }, include: { wallet: true, agreements: true, user: { include: { consents: true } } } });
    expect(a.status).toBe("PENDING");
    expect(a.agentCode).toMatch(/^HJA-\d{6}$/);
    expect(a.referralCode).toMatch(/^[A-Z2-9]{8}$/);
    expect(a.wallet).not.toBeNull();
    expect(a.agreements).toHaveLength(1);
    expect(a.user.consents.map((c) => c.type).sort()).toEqual(["DATA_PROCESSING", "PRIVACY", "TERMS"]);
    expect(a.user.phoneVerifiedAt).not.toBeNull();
    expect(await prisma.commissionEvent.count()).toBe(0); // no reward for signing up
  });

  it("rejects wrong OTP, reused OTP and duplicate email/phone", async () => {
    const r = await registration();
    await expect(registerAgent({ ...r, otpCode: r.otpCode === "000000" ? "111111" : "000000" }, { ip: null, userAgent: null })).rejects.toThrow(/OTP/);
    await registerAgent(r, { ip: null, userAgent: null });
    await expect(registerAgent(r, { ip: null, userAgent: null })).rejects.toThrow(/sudah terdaftar/);
    const again = await registration({ email: r.email });
    await expect(registerAgent(again, { ip: null, userAgent: null })).rejects.toThrow(/sudah terdaftar/);
  });

  it("requires all mandatory consents", async () => {
    const r = await registration();
    await expect(registerAgent({ ...r, consentDataProcessing: false as never }, { ip: null, userAgent: null })).rejects.toThrow();
  });

  it("validates referral codes, blocks self-referral and flags shared bank accounts", async () => {
    const referrer = await makeAgent({ name: "Ref" });
    const ref = await prisma.agent.findUniqueOrThrow({ where: { id: referrer.agentId } });
    await expect(registerAgent(await registration({ referralCode: "NOPE1234" }), { ip: null, userAgent: null })).rejects.toThrow(/referral/);
    await expect(registerAgent(await registration({ referralCode: ref.referralCode, email: ref.email }), { ip: null, userAgent: null })).rejects.toThrow();
    const refBank = await prisma.agentBankAccount.findFirstOrThrow({ where: { agentId: ref.id } });
    const { agentId } = await registerAgent(await registration({ referralCode: ref.referralCode, accountNumber: decryptField(refBank.accountNumberEnc) }), { ip: null, userAgent: null });
    expect(await prisma.agentReferral.findFirst({ where: { recruitAgentId: agentId } })).toMatchObject({ referrerAgentId: ref.id, status: "PENDING" });
    const flags = await prisma.fraudFlag.findMany({ where: { agentId } });
    expect(flags.map((f) => f.type)).toEqual(expect.arrayContaining(["SHARED_BANK_ACCOUNT", "SELF_REFERRAL_SUSPECTED"]));
  });

  it("approval requires verified KYC and activates the referral link", async () => {
    const referrer = await makeAgent();
    const ref = await prisma.agent.findUniqueOrThrow({ where: { id: referrer.agentId } });
    const { agentId } = await registerAgent(await registration({ referralCode: ref.referralCode }), { ip: null, userAgent: null });
    await expect(setAgentStatus(ops, agentId, "ACTIVE")).rejects.toThrow(/KYC/);
    await prisma.agentKYC.update({ where: { agentId }, data: { status: "SUBMITTED" } });
    await reviewKyc(ops, agentId, "VERIFIED");
    await setAgentStatus(ops, agentId, "ACTIVE");
    expect((await prisma.agentReferral.findFirstOrThrow({ where: { recruitAgentId: agentId } })).status).toBe("APPROVED");
    await expect(setAgentStatus(ops, agentId, "PENDING" as never)).rejects.toThrow();
  });
});

describe("referral rules", () => {
  let ops: Actor, sup: Actor, productId: string;
  beforeEach(async () => {
    await resetDb();
    ops = await makeAdmin(["OPERATIONS_ADMIN"], "ops");
    sup = await makeAdmin(["SUPER_ADMIN"], "sup");
    productId = (await makeProduct()).id;
    await addDevices(productId, ["S1", "S2", "S3"]);
    await makeRule({ code: "SALES:P", type: "SALES", productId, fixedAmount: 100_000n });
    await makeRule({ code: "REF:SALES", type: "REFERRAL_SALES", rateBps: 1000 });
  });

  it("pays only the DIRECT referrer — never the grand-referrer", async () => {
    const a = await makeAgent();
    const b = await makeAgent({ referrerAgentId: a.agentId });
    const c = await makeAgent({ referrerAgentId: b.agentId });
    await onboardAndActivate(c, ops, { productId, n: 1, serial: "S1", terminalId: "TIDA0001" });
    await release(addDays(new Date(), 1));
    expect((await wallet(b.agentId)).payableBalance).toBe(10_000n);
    expect((await wallet(a.agentId)).payableBalance).toBe(0n);
    expect((await wallet(c.agentId)).payableBalance).toBe(100_000n);
    expect(await prisma.commissionEvent.count({ where: { type: "REFERRAL_SALES" } })).toBe(1);
  });

  it("can be configured to deduct the share from the recruit instead of paying on top", async () => {
    await prisma.commissionRule.updateMany({ where: { code: "REF:SALES" }, data: { deductFromRecruit: true } });
    const a = await makeAgent();
    const b = await makeAgent({ referrerAgentId: a.agentId });
    await onboardAndActivate(b, ops, { productId, n: 1, serial: "S1", terminalId: "TIDB0001" });
    await release(addDays(new Date(), 1));
    expect((await wallet(b.agentId)).payableBalance).toBe(90_000n);
    expect((await wallet(a.agentId)).payableBalance).toBe(10_000n);
  });

  it("blocks self and circular referrer reassignment", async () => {
    const a = await makeAgent();
    const b = await makeAgent({ referrerAgentId: a.agentId });
    const c = await makeAgent({ referrerAgentId: b.agentId });
    await expect(reassignReferrer(sup, a.agentId, a.agentId, "self referral attempt test")).rejects.toThrow(/sendiri/);
    await expect(reassignReferrer(sup, a.agentId, c.agentId, "would create a loop A<-C<-B<-A")).rejects.toThrow(/melingkar/);
    await expect(reassignReferrer(ops, b.agentId, null, "ops cannot do this one")).rejects.toThrow();
  });

  it("referrer changes are privileged, audited and not retroactive", async () => {
    const a = await makeAgent();
    const x = await makeAgent();
    const b = await makeAgent({ referrerAgentId: a.agentId });
    await onboardAndActivate(b, ops, { productId, n: 1, serial: "S1", terminalId: "TIDC0001" });
    await release(addDays(new Date(), 1));
    await reassignReferrer(sup, b.agentId, x.agentId, "Agreed transfer of recruit, ticket #42");
    await onboardAndActivate(b, ops, { productId, n: 2, serial: "S2", terminalId: "TIDC0002" });
    await release(addDays(new Date(), 2));
    expect((await wallet(a.agentId)).payableBalance).toBe(10_000n); // keeps the first share
    expect((await wallet(x.agentId)).payableBalance).toBe(10_000n); // gets only the later one
    expect(await prisma.auditLog.count({ where: { action: "referral.reassign" } })).toBe(1);
  });
});
