"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Alert } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { BANKS } from "@/lib/banks";
import { PROVINCES } from "@/lib/regions";
import { normalizePhone } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/client";
import { registerAction, sendRegistrationOtpAction } from "../actions";

const schema = z.object({
  fullName: z.string().trim().min(3, "Nama minimal 3 karakter"),
  phone: z.string().refine((v) => !!normalizePhone(v), "Nomor ponsel tidak valid"),
  email: z.string().trim().email("Email tidak valid"),
  password: z.string().min(10, "Minimal 10 karakter").regex(/[A-Za-z]/, "Harus ada huruf").regex(/\d/, "Harus ada angka"),
  addressLine: z.string().trim().min(5, "Alamat terlalu pendek"),
  city: z.string().trim().min(2, "Wajib diisi"),
  province: z.string().min(2, "Pilih provinsi"),
  postalCode: z.string().regex(/^(\d{5})?$/, "Kode pos 5 digit").optional(),
  bankCode: z.string().min(1, "Pilih bank"),
  accountHolderName: z.string().trim().min(3, "Wajib diisi"),
  accountNumber: z.string().regex(/^\d{6,20}$/, "Nomor rekening 6–20 digit"),
  referralCode: z.string().max(16).optional(),
  otpCode: z.string().regex(/^\d{6}$/, "Kode OTP 6 digit"),
  consentTerms: z.literal(true, { errorMap: () => ({ message: "Wajib disetujui" }) }),
  consentPrivacy: z.literal(true, { errorMap: () => ({ message: "Wajib disetujui" }) }),
  consentDataProcessing: z.literal(true, { errorMap: () => ({ message: "Wajib disetujui" }) }),
  consentWhatsapp: z.boolean(),
});
type Values = z.infer<typeof schema>;

export function RegisterForm({ defaultReferral }: { defaultReferral?: string }) {
  const { t } = useI18n();
  const r = t.register;
  const router = useRouter();
  const [challenge, setChallenge] = useState<{ id: string; mockCode: string | null; phone: string } | null>(null);
  const [sending, startSend] = useTransition();
  const [submitting, startSubmit] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const { register, handleSubmit, getValues, trigger, formState: { errors } } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { referralCode: defaultReferral ?? "", consentWhatsapp: false, province: "", bankCode: "" },
  });
  const err = (k: keyof Values) => errors[k]?.message as string | undefined;
  const aria = (k: keyof Values) => ({ "aria-invalid": !!errors[k], "aria-describedby": errors[k] ? `${k}-error` : undefined });

  const sendOtp = async () => {
    const ok = await trigger(["phone", "email"]);
    if (!ok) return;
    startSend(async () => {
      const res = await sendRegistrationOtpAction(getValues("phone"), getValues("email"));
      if (!res.ok) return void toast.error(res.error);
      const d = res.data as { challengeId: string; mockCode: string | null };
      setChallenge({ id: d.challengeId, mockCode: d.mockCode, phone: getValues("phone") });
      toast.success(`${r.otpSent} ${getValues("phone")}`);
    });
  };

  const onSubmit = (v: Values) => {
    setFormError(null);
    if (!challenge) return setFormError("Minta kode OTP terlebih dahulu.");
    startSubmit(async () => {
      const res = await registerAction({ ...v, otpChallengeId: challenge.id, postalCode: v.postalCode || "", referralCode: v.referralCode || "" });
      if (res.ok) router.push("/login?registered=1");
      else setFormError(res.error);
    });
  };

  const section = "grid gap-4 rounded-xl border bg-card p-5";
  const h = "text-sm font-bold uppercase tracking-wider text-navy-800";
  return (
    <form onSubmit={handleSubmit(onSubmit)} className="grid gap-5" noValidate>
      {formError && <Alert variant="danger">{formError}</Alert>}
      <section className={section}>
        <h2 className={h}>{r.sectionAccount}</h2>
        <Field label={r.fullName} htmlFor="fullName" error={err("fullName")}><Input id="fullName" autoComplete="name" {...register("fullName")} {...aria("fullName")} /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={r.phone} htmlFor="phone" error={err("phone")}><Input id="phone" inputMode="tel" autoComplete="tel" placeholder="08xx xxxx xxxx" {...register("phone")} {...aria("phone")} /></Field>
          <Field label={r.email} htmlFor="email" error={err("email")}><Input id="email" type="email" autoComplete="email" {...register("email")} {...aria("email")} /></Field>
        </div>
        <Field label={r.password} htmlFor="password" error={err("password")} hint={r.passwordHint}><Input id="password" type="password" autoComplete="new-password" {...register("password")} {...aria("password")} /></Field>
      </section>
      <section className={section}>
        <h2 className={h}>{r.sectionAddress}</h2>
        <Field label={r.address} htmlFor="addressLine" error={err("addressLine")}><Input id="addressLine" autoComplete="street-address" {...register("addressLine")} {...aria("addressLine")} /></Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={r.city} htmlFor="city" error={err("city")}><Input id="city" {...register("city")} {...aria("city")} /></Field>
          <Field label={r.province} htmlFor="province" error={err("province")}>
            <NativeSelect id="province" {...register("province")} {...aria("province")}>
              <option value="">—</option>
              {PROVINCES.map((p) => <option key={p}>{p}</option>)}
            </NativeSelect>
          </Field>
          <Field label={r.postalCode} htmlFor="postalCode" error={err("postalCode")}><Input id="postalCode" inputMode="numeric" maxLength={5} {...register("postalCode")} {...aria("postalCode")} /></Field>
        </div>
      </section>
      <section className={section}>
        <h2 className={h}>{r.sectionBank}</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={r.bank} htmlFor="bankCode" error={err("bankCode")}>
            <NativeSelect id="bankCode" {...register("bankCode")} {...aria("bankCode")}>
              <option value="">—</option>
              {BANKS.map((b) => <option key={b.code} value={b.code}>{b.name}</option>)}
            </NativeSelect>
          </Field>
          <Field label={r.accountHolder} htmlFor="accountHolderName" error={err("accountHolderName")}><Input id="accountHolderName" {...register("accountHolderName")} {...aria("accountHolderName")} /></Field>
          <Field label={r.accountNumber} htmlFor="accountNumber" error={err("accountNumber")}><Input id="accountNumber" inputMode="numeric" {...register("accountNumber")} {...aria("accountNumber")} /></Field>
        </div>
      </section>
      <section className={section}>
        <h2 className={h}>{r.sectionReferral}</h2>
        <Field label={r.referralCode} htmlFor="referralCode" hint={r.referralHint}><Input id="referralCode" className="font-mono uppercase" {...register("referralCode")} /></Field>
      </section>
      <section className={section}>
        <h2 className={h}>OTP</h2>
        <div className="flex flex-wrap items-end gap-3">
          <Button type="button" variant="secondary" onClick={sendOtp} disabled={sending}>
            {sending ? <Loader2 className="animate-spin" /> : <ShieldCheck />}
            {challenge ? r.resendOtp : r.sendOtp}
          </Button>
          {challenge && <span className="text-sm text-muted-foreground">{r.otpSent} {challenge.phone}</span>}
        </div>
        {challenge?.mockCode && (
          <Alert variant="warning">
            <Badge variant="mock" className="mr-2">Mock</Badge>
            {r.mockOtp}: <b className="font-mono text-base tracking-widest" data-testid="mock-otp">{challenge.mockCode}</b>
          </Alert>
        )}
        <Field label={r.otp} htmlFor="otpCode" error={err("otpCode")}><Input id="otpCode" inputMode="numeric" autoComplete="one-time-code" maxLength={6} className="max-w-[12rem] font-mono tracking-widest" {...register("otpCode")} {...aria("otpCode")} /></Field>
      </section>
      <section className={section}>
        <h2 className={h}>{r.sectionConsent}</h2>
        {([
          ["consentTerms", <>{r.consentTerms} (<Link className="underline" href="/terms" target="_blank">baca</Link>)</>],
          ["consentPrivacy", <>{r.consentPrivacy} (<Link className="underline" href="/privacy" target="_blank">baca</Link>)</>],
          ["consentDataProcessing", r.consentData],
          ["consentWhatsapp", r.consentWhatsapp],
        ] as const).map(([k, label]) => (
          <div key={k}>
            <label className="flex items-start gap-3 text-sm">
              <input type="checkbox" className="mt-0.5 size-4 accent-navy-800" {...register(k)} aria-invalid={!!errors[k]} />
              <span>{label}</span>
            </label>
            {errors[k] && <p className="ml-7 mt-1 text-xs font-medium text-destructive">{errors[k]?.message as string}</p>}
          </div>
        ))}
      </section>
      <Button type="submit" size="lg" disabled={submitting}>
        {submitting && <Loader2 className="animate-spin" />}
        {r.submit}
      </Button>
    </form>
  );
}
