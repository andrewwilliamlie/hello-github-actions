import { CheckCircle2, Circle } from "lucide-react";
import { pageContext } from "@/server/page-auth";
import { onboardingChecklist } from "@/server/modules/agents";
import { AGENT_AGREEMENT_TEXT, AGENT_AGREEMENT_VERSION } from "@/server/modules/agreements";
import { prisma } from "@/server/db";
import { getDictionary } from "@/lib/i18n/server";
import { BANKS } from "@/lib/banks";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, PageHeader } from "@/components/ui/misc";
import { Field } from "@/components/ui/label";
import { Input, NativeSelect } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { ActionForm } from "@/components/shared/action-form";
import { ActionButton } from "@/components/shared/action-button";
import { acceptAgreementAction, addBankAction, submitKycAction, whatsappOptInAction } from "../actions";
import { cn } from "@/lib/utils";

export const metadata = { title: "Onboarding" };

export default async function OnboardingPage() {
  const { actor } = await pageContext("agent");
  const { t } = await getDictionary();
  const c = await onboardingChecklist(actor.agentId!);
  const agent = await prisma.agent.findUniqueOrThrow({ where: { id: actor.agentId! } });
  const done = c.items.filter((i) => i.done).length;
  const item = (k: string) => c.items.find((i) => i.key === k)!;
  const labels = t.agent.checklist as Record<string, string>;
  const kycState = item("kyc").state as string;
  const bankState = item("bank").state as string;

  return (
    <>
      <PageHeader title={t.nav.onboarding} description={`${done} / ${c.items.length} langkah selesai`} />
      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <Card className="h-fit">
          <CardHeader><CardTitle>Checklist</CardTitle></CardHeader>
          <CardContent>
            <div className="mb-4 h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={done} aria-valuemin={0} aria-valuemax={c.items.length}>
              <div className="h-full rounded-full bg-navy-700" style={{ width: `${(done / c.items.length) * 100}%` }} />
            </div>
            <ol className="space-y-3">
              {c.items.map((i) => (
                <li key={i.key} className="flex items-start gap-3 text-sm">
                  {i.done ? <CheckCircle2 className="mt-0.5 size-5 text-emerald-600" aria-label="Selesai" /> : <Circle className="mt-0.5 size-5 text-muted-foreground" aria-label="Belum" />}
                  <div className={cn("min-w-0", i.done && "text-muted-foreground")}>
                    <div className="font-semibold">{labels[i.key]}</div>
                    {"state" in i && i.state && !i.done && <StatusBadge status={String(i.state)} label={t.status[String(i.state) as keyof typeof t.status]} />}
                    {"reason" in i && i.reason && <p className="mt-1 text-xs text-destructive">{i.reason}</p>}
                  </div>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>

        <div className="grid gap-6">
          <Card>
            <CardHeader>
              <CardTitle>{labels.agreement}</CardTitle>
              <CardDescription>Versi {AGENT_AGREEMENT_VERSION}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-lg border bg-muted/40 p-3 font-sans text-xs">{AGENT_AGREEMENT_TEXT}</pre>
              {item("agreement").done ? <Alert variant="success">Perjanjian versi terbaru telah Anda terima.</Alert> : <div><ActionButton action={acceptAgreementAction} label="Saya menerima perjanjian ini" variant="default" size="default" /></div>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{labels.kyc}</CardTitle>
              <CardDescription>NIK dan foto KTP dienkripsi dan hanya dapat dilihat oleh petugas verifikasi. Setiap akses dicatat.</CardDescription>
            </CardHeader>
            <CardContent>
              {kycState === "VERIFIED" ? (
                <Alert variant="success">KTP terverifikasi (NIK ****{c.kyc?.idNumberLast4}).</Alert>
              ) : kycState === "SUBMITTED" ? (
                <Alert variant="info">KTP sedang ditinjau tim Hausjo.</Alert>
              ) : (
                <ActionForm action={submitKycAction} submitLabel="Kirim untuk verifikasi">
                  {kycState === "REJECTED" && <Alert variant="danger" title="Ditolak">{c.kyc?.rejectionReason}</Alert>}
                  <Field label="NIK (16 digit)" htmlFor="idNumber"><Input id="idNumber" name="idNumber" inputMode="numeric" pattern="\d{16}" maxLength={16} required /></Field>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Foto KTP" htmlFor="idCard" hint="JPG/PNG/WEBP/PDF, maks. 8 MB"><Input id="idCard" name="idCard" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" required /></Field>
                    <Field label="Selfie dengan KTP" htmlFor="selfie" hint="JPG/PNG/WEBP, maks. 8 MB"><Input id="selfie" name="selfie" type="file" accept="image/jpeg,image/png,image/webp" required /></Field>
                  </div>
                </ActionForm>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{labels.bank}</CardTitle>
              <CardDescription>Penarikan hanya ke rekening atas nama Anda yang telah diverifikasi.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              {c.bank && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm">
                  <div><b>{c.bank.bankName}</b> · ****{c.bank.accountNumberLast4} · {c.bank.accountHolderName}</div>
                  <StatusBadge status={bankState} label={t.status[bankState as keyof typeof t.status]} />
                </div>
              )}
              {c.bank?.status === "REJECTED" && <Alert variant="danger" title="Rekening ditolak">{c.bank.rejectionReason}</Alert>}
              <details className="rounded-lg border p-3" open={!c.bank || c.bank.status === "REJECTED"}>
                <summary className="cursor-pointer text-sm font-semibold">{c.bank ? "Ganti rekening" : "Tambah rekening"}</summary>
                <ActionForm action={addBankAction} submitLabel="Simpan rekening" className="mt-4">
                  <div className="grid gap-4 sm:grid-cols-3">
                    <Field label="Bank" htmlFor="bankCode"><NativeSelect id="bankCode" name="bankCode" required defaultValue=""><option value="">—</option>{BANKS.map((b) => <option key={b.code} value={b.code}>{b.name}</option>)}</NativeSelect></Field>
                    <Field label="Nama pemilik" htmlFor="accountHolderName"><Input id="accountHolderName" name="accountHolderName" defaultValue={agent.fullName} required /></Field>
                    <Field label="Nomor rekening" htmlFor="accountNumber"><Input id="accountNumber" name="accountNumber" inputMode="numeric" required /></Field>
                  </div>
                  {c.bank && <p className="text-xs text-muted-foreground">Rekening lama akan diarsipkan dan rekening baru perlu diverifikasi ulang.</p>}
                </ActionForm>
              </details>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Notifikasi WhatsApp</CardTitle>
              <CardDescription>Opsional. Dikirim hanya melalui penyedia resmi WhatsApp Business dengan templat yang disetujui.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center gap-3">
              <StatusBadge status={agent.whatsappOptIn ? "ACTIVE" : "DISABLED"} label={agent.whatsappOptIn ? "Diizinkan" : "Tidak diizinkan"} />
              <ActionButton action={whatsappOptInAction} args={{ optIn: agent.whatsappOptIn ? "false" : "true" }} label={agent.whatsappOptIn ? "Cabut izin" : "Izinkan WhatsApp"} variant="outline" />
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
