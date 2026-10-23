import { pageContext } from "@/server/page-auth";
import { prisma } from "@/server/db";
import { getDictionary } from "@/lib/i18n/server";
import { formatDateTime } from "@/lib/time";
import { maskPhone } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DescriptionList, PageHeader } from "@/components/ui/misc";
import { Field } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { ActionForm } from "@/components/shared/action-form";
import { ActionButton } from "@/components/shared/action-button";
import { changePasswordAction, setLocaleAction } from "../actions";

export const metadata = { title: "Profil" };

export default async function ProfilePage() {
  const { actor, session } = await pageContext("agent");
  const { t, locale } = await getDictionary();
  const agent = await prisma.agent.findUniqueOrThrow({ where: { id: actor.agentId! }, include: { user: { include: { consents: { orderBy: { grantedAt: "desc" } } } } } });
  return (
    <>
      <PageHeader title={t.nav.profile} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Data agen</CardTitle></CardHeader>
          <CardContent>
            <DescriptionList items={[
              { label: "Nama", value: agent.fullName }, { label: "ID agen", value: <span className="font-mono">{agent.agentCode}</span> },
              { label: "Kode referral", value: <span className="font-mono">{agent.referralCode}</span> }, { label: "Email", value: agent.email },
              { label: "Ponsel", value: maskPhone(agent.phone) }, { label: "Alamat", value: `${agent.addressLine}, ${agent.city}, ${agent.province}` },
              { label: "Terdaftar", value: formatDateTime(agent.createdAt, locale) }, { label: "Disetujui", value: formatDateTime(agent.approvedAt, locale) },
            ]} />
            <p className="mt-4 text-xs text-muted-foreground">Untuk mengubah nama, ponsel, atau alamat, hubungi dukungan Hausjo (perubahan identitas memerlukan verifikasi ulang).</p>
          </CardContent>
        </Card>
        <div className="grid gap-6">
          <Card>
            <CardHeader><CardTitle>{t.common.language}</CardTitle></CardHeader>
            <CardContent className="flex gap-2">
              <ActionButton action={setLocaleAction} args={{ locale: "id" }} label="Bahasa Indonesia" variant={session.user.locale === "id" ? "default" : "outline"} />
              <ActionButton action={setLocaleAction} args={{ locale: "en" }} label="English" variant={session.user.locale === "en" ? "default" : "outline"} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Ubah kata sandi</CardTitle></CardHeader>
            <CardContent>
              <ActionForm action={changePasswordAction} submitLabel="Ubah kata sandi" redirectTo="/login">
                <Field label="Kata sandi saat ini" htmlFor="current"><Input id="current" name="current" type="password" autoComplete="current-password" required /></Field>
                <Field label="Kata sandi baru" htmlFor="next" hint="Minimal 10 karakter, huruf dan angka"><Input id="next" name="next" type="password" autoComplete="new-password" minLength={10} required /></Field>
              </ActionForm>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Riwayat persetujuan</CardTitle></CardHeader>
            <CardContent>
              <ul className="space-y-1 text-sm">
                {agent.user.consents.map((c) => <li key={c.id}><b>{c.type}</b> v{c.version} — {formatDateTime(c.grantedAt, locale)}{c.withdrawnAt && ` (dicabut ${formatDateTime(c.withdrawnAt, locale)})`}</li>)}
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
