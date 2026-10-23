import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getDictionary } from "@/lib/i18n/server";
import { getSession } from "@/server/auth/session";
import { MfaForm } from "./mfa-form";

export const metadata = { title: "Verifikasi MFA" };

export default async function MfaPage() {
  const s = await getSession();
  if (!s) redirect("/login");
  if (!s.user.mfaEnabled) redirect("/login/mfa/setup");
  const { t } = await getDictionary();
  return (
    <div className="mx-auto mt-6 max-w-md">
      <Card className="shadow-xl">
        <CardHeader>
          <CardTitle className="text-xl">{t.auth.mfaTitle}</CardTitle>
          <CardDescription>{t.auth.mfaBody}</CardDescription>
        </CardHeader>
        <CardContent>
          <MfaForm label={t.auth.code} button={t.auth.verify} />
        </CardContent>
      </Card>
    </div>
  );
}
