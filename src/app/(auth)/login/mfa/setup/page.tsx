import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getDictionary } from "@/lib/i18n/server";
import { getSession } from "@/server/auth/session";
import { MfaSetupClient } from "./setup-client";

export const metadata = { title: "Aktifkan MFA" };

export default async function MfaSetupPage() {
  const s = await getSession();
  if (!s) redirect("/login");
  if (s.user.mfaEnabled) redirect("/login/mfa");
  const { t } = await getDictionary();
  return (
    <div className="mx-auto mt-6 max-w-md">
      <Card className="shadow-xl">
        <CardHeader>
          <CardTitle className="text-xl">{t.auth.mfaSetupTitle}</CardTitle>
          <CardDescription>{t.auth.mfaSetupBody}</CardDescription>
        </CardHeader>
        <CardContent>
          <MfaSetupClient codeLabel={t.auth.code} button={t.auth.verify} secretLabel={t.auth.secretKey} />
        </CardContent>
      </Card>
    </div>
  );
}
