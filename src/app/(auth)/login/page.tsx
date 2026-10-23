import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/misc";
import { getDictionary } from "@/lib/i18n/server";
import { I18nProvider } from "@/lib/i18n/client";
import { getSession } from "@/server/auth/session";
import { homeFor } from "@/server/modules/auth-flow";
import { LoginForm } from "./login-form";

export const metadata = { title: "Masuk" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ denied?: string; registered?: string }> }) {
  const { t, locale } = await getDictionary();
  const sp = await searchParams;
  const s = await getSession();
  if (s && s.mfaVerified && !sp.denied) redirect(homeFor(s.roles));
  return (
    <I18nProvider t={t} locale={locale}>
      <div className="mx-auto mt-6 max-w-md">
        <Card className="shadow-xl">
          <CardHeader>
            <CardTitle className="text-xl">{t.auth.loginTitle}</CardTitle>
            <CardDescription>{t.auth.loginBody}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            {sp.registered && <Alert variant="success" title={t.register.successTitle}>{t.register.successBody}</Alert>}
            {sp.denied && <Alert variant="warning">Anda tidak memiliki akses ke halaman tersebut dengan akun ini.</Alert>}
            <LoginForm />
            <p className="text-center text-sm text-muted-foreground">
              {t.auth.noAccount} <Link href="/register" className="font-semibold text-navy-700 hover:underline">{t.auth.registerLink}</Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </I18nProvider>
  );
}
