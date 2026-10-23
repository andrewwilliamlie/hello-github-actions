import { adminPage } from "@/server/page-auth";
import { prisma } from "@/server/db";
import { env } from "@/server/env";
import { getDictionary } from "@/lib/i18n/server";
import { serialize } from "@/lib/money";
import { WHATSAPP_TEMPLATES } from "@/server/notifications/whatsapp";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, PageHeader } from "@/components/ui/misc";
import { DataTable } from "@/components/shared/data-table";

export const metadata = { title: "Kotak keluar notifikasi" };

export default async function Outbox() {
  await adminPage("notification.outbox");
  const { t, locale } = await getDictionary();
  const e = env();
  const rows = await prisma.notificationDelivery.findMany({ orderBy: { createdAt: "desc" }, take: 1000 });
  return (
    <>
      <PageHeader title={t.nav.outbox} description="Setiap pengiriman email/WhatsApp/SMS tercatat di sini. Isi berupa variabel templat, tanpa rahasia (kode OTP tidak disimpan)." />
      <div className="mb-6 grid gap-4 md:grid-cols-3">
        {[["Email", e.EMAIL_PROVIDER], ["WhatsApp", e.WHATSAPP_PROVIDER], ["SMS/OTP", e.SMS_PROVIDER]].map(([k, v]) => (
          <Alert key={k} variant={v === "mock" ? "warning" : "success"} title={`${k}: ${v === "mock" ? "MOCK (tidak ada pesan nyata)" : v}`} />
        ))}
      </div>
      <Card className="mb-6">
        <CardHeader><CardTitle>Templat WhatsApp resmi</CardTitle><CardDescription>Dikirim hanya ke agen dengan persetujuan WhatsApp, saat fitur diaktifkan di Pengaturan, melalui penyedia resmi.</CardDescription></CardHeader>
        <CardContent><ul className="grid gap-1 text-sm sm:grid-cols-2">{Object.entries(WHATSAPP_TEMPLATES).map(([k, v]) => <li key={k}><span className="font-mono">{k}</span> → <span className="font-mono text-navy-700">{v}</span></li>)}</ul></CardContent>
      </Card>
      <DataTable rows={serialize(rows.map((r) => ({ channel: r.channel, provider: r.provider, template: r.templateKey, to: r.toMasked, status: r.status, error: r.error ?? "", createdAt: r.createdAt })))} locale={locale} statusLabels={t.status as unknown as Record<string, string>}
        columns={[{ key: "channel", header: "Kanal" }, { key: "provider", header: "Penyedia", type: "mono" }, { key: "template", header: "Templat", type: "mono" }, { key: "to", header: "Tujuan (disamarkan)" }, { key: "status", header: "Status", type: "status" }, { key: "error", header: "Kesalahan" }, { key: "createdAt", header: "Waktu", type: "datetime" }]} />
    </>
  );
}
