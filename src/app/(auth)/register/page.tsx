import { getDictionary } from "@/lib/i18n/server";
import { I18nProvider } from "@/lib/i18n/client";
import { RegisterForm } from "./register-form";
import { prisma } from "@/server/db";
import { Alert } from "@/components/ui/misc";

export const metadata = { title: "Daftar Agen" };

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ ref?: string }> }) {
  const { t, locale } = await getDictionary();
  const { ref } = await searchParams;
  const code = ref?.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 16);
  const referrer = code ? await prisma.agent.findFirst({ where: { referralCode: code, status: "ACTIVE" }, select: { fullName: true } }) : null;
  return (
    <I18nProvider t={t} locale={locale}>
      <div className="mx-auto mt-2 grid max-w-3xl gap-5">
        <div className="text-white">
          <h1 className="text-3xl font-extrabold tracking-tight">{t.register.title}</h1>
          <p className="mt-2 text-sky-100/90">{t.register.body}</p>
        </div>
        {referrer && <Alert variant="info">Anda diundang oleh <b>{referrer.fullName}</b> (kode {code}).</Alert>}
        {code && !referrer && <Alert variant="warning">Kode referral {code} tidak valid atau agen belum aktif. Anda tetap dapat mendaftar tanpa kode.</Alert>}
        <RegisterForm defaultReferral={referrer ? code : ""} />
      </div>
    </I18nProvider>
  );
}
