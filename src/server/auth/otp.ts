import "server-only";
import type { OtpPurpose } from "@prisma/client";
import { prisma } from "../db";
import { env, isMockMode } from "../env";
import { AppError, invalid } from "../errors";
import { randomDigits, safeEqual, sha256Hex } from "../crypto";
import { rateLimit } from "./rate-limit";
import { smsProvider } from "../notifications/sms";

const TTL_MS = 5 * 60_000;
const RESEND_COOLDOWN_MS = 60_000;

function codeHash(challengeId: string, code: string) {
  return sha256Hex(`${env().OTP_PEPPER}:${challengeId}:${code}`);
}

export interface OtpSendResult {
  challengeId: string;
  expiresAt: Date;
  /** Only returned when the mock SMS provider is active outside production. */
  mockCode?: string;
}

export async function sendOtp(purpose: OtpPurpose, phone: string, ctx: { ip?: string | null; userId?: string }): Promise<OtpSendResult> {
  await rateLimit(`otp:send:phone:${phone}`, 5, 3600);
  if (ctx.ip) await rateLimit(`otp:send:ip:${ctx.ip}`, 20, 3600);
  const last = await prisma.otpChallenge.findFirst({ where: { destination: phone, purpose }, orderBy: { createdAt: "desc" } });
  if (last && Date.now() - last.createdAt.getTime() < RESEND_COOLDOWN_MS) {
    throw new AppError("RATE_LIMITED", "Tunggu 60 detik sebelum meminta kode baru.");
  }
  const code = randomDigits(6);
  const challenge = await prisma.otpChallenge.create({
    data: { purpose, destination: phone, codeHash: "pending", expiresAt: new Date(Date.now() + TTL_MS), userId: ctx.userId },
  });
  await prisma.otpChallenge.update({ where: { id: challenge.id }, data: { codeHash: codeHash(challenge.id, code) } });
  await smsProvider().sendOtp(phone, code, purpose);
  return { challengeId: challenge.id, expiresAt: challenge.expiresAt, mockCode: isMockMode() ? code : undefined };
}

/**
 * Verifies and consumes a challenge. Runs outside the caller's transaction on purpose so that
 * failed attempts are counted even when the caller rolls back.
 */
export async function verifyOtp(challengeId: string, phone: string, purpose: OtpPurpose, code: string): Promise<void> {
  const c = await prisma.otpChallenge.findUnique({ where: { id: challengeId } });
  if (!c || c.destination !== phone || c.purpose !== purpose) throw invalid("Kode OTP tidak valid.");
  if (c.consumedAt) throw invalid("Kode OTP sudah digunakan. Minta kode baru.");
  if (c.expiresAt < new Date()) throw invalid("Kode OTP kedaluwarsa. Minta kode baru.");
  if (c.attempts >= c.maxAttempts) throw new AppError("RATE_LIMITED", "Terlalu banyak percobaan OTP. Minta kode baru.");
  const ok = safeEqual(c.codeHash, codeHash(c.id, code.trim()));
  if (!ok) {
    await prisma.otpChallenge.update({ where: { id: c.id }, data: { attempts: { increment: 1 } } });
    throw invalid("Kode OTP salah.");
  }
  const consumed = await prisma.otpChallenge.updateMany({ where: { id: c.id, consumedAt: null }, data: { consumedAt: new Date() } });
  if (consumed.count !== 1) throw invalid("Kode OTP sudah digunakan.");
}
