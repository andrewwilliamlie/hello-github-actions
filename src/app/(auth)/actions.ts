"use server";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { login, logout, verifyMfa, beginMfaSetup } from "@/server/modules/auth-flow";
import { registerAgent, type RegistrationInput } from "@/server/modules/agents";
import { sendOtp } from "@/server/auth/otp";
import { clientIp } from "@/server/auth/session";
import { runPublicAction, toActionError, type ActionResult } from "@/server/action";
import { normalizePhone } from "@/lib/utils";
import { invalid, duplicate } from "@/server/errors";
import { prisma } from "@/server/db";

export async function loginAction(_: unknown, form: FormData): Promise<ActionResult | never> {
  let target: string;
  try {
    const r = await login(String(form.get("identifier") ?? ""), String(form.get("password") ?? ""), await clientIp());
    target = r.next === "mfa_setup" ? "/login/mfa/setup" : r.next === "mfa_verify" ? "/login/mfa" : r.home;
  } catch (e) {
    return toActionError(e);
  }
  redirect(target);
}

export async function verifyMfaAction(_: unknown, form: FormData): Promise<ActionResult | never> {
  let target: string;
  try {
    target = await verifyMfa(String(form.get("code") ?? ""), await clientIp());
  } catch (e) {
    return toActionError(e);
  }
  redirect(target);
}

export async function beginMfaSetupAction() {
  return runPublicAction(() => beginMfaSetup());
}

export async function logoutAction() {
  await logout();
  redirect("/login");
}

export async function sendRegistrationOtpAction(phoneRaw: string, email: string) {
  return runPublicAction(async () => {
    const phone = normalizePhone(phoneRaw);
    if (!phone) throw invalid("Nomor ponsel tidak valid.");
    const exists = await prisma.user.findFirst({ where: { OR: [{ phone }, { email: email.trim().toLowerCase() }] } });
    if (exists) throw duplicate("Email atau nomor ponsel sudah terdaftar. Silakan masuk.");
    const r = await sendOtp("REGISTRATION", phone, { ip: await clientIp() });
    return { challengeId: r.challengeId, mockCode: r.mockCode ?? null, expiresAt: r.expiresAt };
  });
}

export async function registerAction(input: RegistrationInput) {
  const h = await headers();
  return runPublicAction(async () => {
    await registerAgent(input, { ip: await clientIp(), userAgent: h.get("user-agent") });
  }, { message: "Pendaftaran berhasil" });
}
