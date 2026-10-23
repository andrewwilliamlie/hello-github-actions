import Link from "next/link";
import { adminPage } from "@/server/page-auth";
import { prisma } from "@/server/db";
import { getDictionary } from "@/lib/i18n/server";
import { serialize } from "@/lib/money";
import { formatDateTime } from "@/lib/time";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { Field } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { RevealOnceForm } from "@/components/shared/reveal-once-form";
import { ActionButton } from "@/components/shared/action-button";
import { DataTable } from "@/components/shared/data-table";
import { createApiClientAction, replayWebhookAction, revokeApiClientAction } from "../actions";

export const metadata = { title: "Integrasi" };

export default async function Integrations() {
  await adminPage("webhook.manage");
  const { t, locale } = await getDictionary();
  const [clients, hooks, jobs] = await Promise.all([
    prisma.apiClient.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.webhookEvent.findMany({ orderBy: { receivedAt: "desc" }, take: 300 }),
    prisma.job.groupBy({ by: ["status"], _count: true }),
  ]);
  const L = t.status as unknown as Record<string, string>;
  return (
    <>
      <PageHeader title={t.nav.integrations} description={<>API untuk prosesor pembayaran dan mitra. Spesifikasi: <Link className="underline" href="/api-docs">OpenAPI</Link>.</>} />
      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>API client</CardTitle><CardDescription>Setiap client terikat pada satu kode sumber transaksi. Kunci hanya ditampilkan sekali; yang disimpan hanya hash-nya.</CardDescription></CardHeader>
          <CardContent className="grid gap-4">
            <ul className="divide-y text-sm">
              {clients.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span><b>{c.name}</b> · <span className="font-mono">{c.partnerSource}</span> · hj_{c.keyPrefix}_… · terakhir {formatDateTime(c.lastUsedAt, locale)}</span>
                  <span className="flex items-center gap-2"><StatusBadge status={c.isActive ? "ACTIVE" : "DISABLED"} label={c.isActive ? "Aktif" : "Dicabut"} />{c.isActive && <ActionButton action={revokeApiClientAction} args={{ clientId: c.id }} label="Cabut" variant="outline" confirmTitle="Cabut API key ini?" />}</span>
                </li>
              ))}
            </ul>
            <RevealOnceForm action={createApiClientAction} submitLabel="Buat API client" labels={{ apiKey: "API key", webhookSecret: "Webhook signing secret" }}>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Nama" htmlFor="name"><Input id="name" name="name" required /></Field>
                <Field label="Kode sumber" htmlFor="partnerSource"><Input id="partnerSource" name="partnerSource" required className="font-mono uppercase" placeholder="PARTNER_A" /></Field>
              </div>
            </RevealOnceForm>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Antrean pekerjaan latar belakang</CardTitle><CardDescription>Diproses oleh worker (<code>npm run worker</code>).</CardDescription></CardHeader>
          <CardContent className="flex flex-wrap gap-3 text-sm">{["QUEUED", "RUNNING", "SUCCEEDED", "FAILED", "DEAD"].map((s) => <span key={s} className="rounded-lg border px-3 py-2">{s}: <b>{jobs.find((j) => j.status === s)?._count ?? 0}</b></span>)}</CardContent>
        </Card>
      </div>
      <h2 className="mb-3 mt-8 text-lg font-bold">Webhook masuk</h2>
      <DataTable rows={serialize(hooks.map((h) => ({ id: h.id, provider: h.provider, eventId: h.externalEventId, type: h.eventType, status: h.status, attempts: h.attempts, error: h.lastError ?? "", receivedAt: h.receivedAt })))} locale={locale} statusLabels={L} emptyTitle="Belum ada webhook"
        columns={[{ key: "provider", header: "Sumber", type: "mono" }, { key: "eventId", header: "Event ID", type: "mono" }, { key: "type", header: "Jenis" }, { key: "status", header: "Status", type: "status" }, { key: "attempts", header: "Percobaan", type: "number", align: "right" }, { key: "error", header: "Kesalahan" }, { key: "receivedAt", header: "Diterima", type: "datetime" }]} />
      {hooks.some((h) => h.status === "DEAD_LETTER" || h.status === "FAILED") && (
        <Card className="mt-4">
          <CardHeader><CardTitle>Dead letter</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-2">{hooks.filter((h) => h.status === "DEAD_LETTER" || h.status === "FAILED").map((h) => <ActionButton key={h.id} action={replayWebhookAction} args={{ webhookId: h.id }} label={`Putar ulang ${h.externalEventId}`} variant="outline" />)}</CardContent>
        </Card>
      )}
    </>
  );
}
