import Link from "next/link";
import { notFound } from "next/navigation";
import { adminPage } from "@/server/page-auth";
import { prisma } from "@/server/db";
import { can } from "@/server/rbac";
import { getDictionary } from "@/lib/i18n/server";
import { formatRupiah, serialize } from "@/lib/money";
import { formatDateTime } from "@/lib/time";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, DescriptionList, PageHeader } from "@/components/ui/misc";
import { Field } from "@/components/ui/label";
import { Input, NativeSelect } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { ActionButton } from "@/components/shared/action-button";
import { ActionForm } from "@/components/shared/action-form";
import { RevealOnceForm } from "@/components/shared/reveal-once-form";
import { DataTable } from "@/components/shared/data-table";
import { StageTimeline } from "@/components/shared/stage-timeline";
import { activateDeviceAction, assignDeviceAction, changeAttributionAction, merchantPortalUserAction, merchantSuspendAction, refundOrderAction, verifyPaymentAction } from "../../actions";

export const metadata = { title: "Detail merchant" };

export default async function AdminMerchant({ params }: { params: Promise<{ id: string }> }) {
  const { actor } = await adminPage("merchant.view");
  const { t, locale } = await getDictionary();
  const { id } = await params;
  const m = await prisma.merchant.findUnique({
    where: { id },
    include: {
      user: { select: { email: true } }, lead: { select: { id: true } },
      attributions: { orderBy: { effectiveFrom: "desc" }, include: { agent: { select: { id: true, fullName: true, agentCode: true } } } },
      orders: { orderBy: { createdAt: "asc" }, include: { product: true, payments: true, device: true, activation: true } },
    },
  });
  if (!m) notFound();
  const [stock, txns, events] = await Promise.all([
    prisma.device.findMany({ where: { status: "IN_STOCK", productId: { in: m.orders.map((o) => o.productId) } }, select: { id: true, serialNumber: true, productId: true }, orderBy: { serialNumber: "asc" }, take: 200 }),
    prisma.transaction.findMany({ where: { merchantId: id }, orderBy: { occurredAt: "desc" }, take: 200 }),
    prisma.commissionEvent.findMany({ where: { merchantId: id, type: "SALES" }, include: { agent: { select: { agentCode: true } } } }),
  ]);
  const L = t.status as unknown as Record<string, string>;
  const current = m.attributions.find((a) => !a.effectiveTo);
  return (
    <>
      <PageHeader
        eyebrow={<Link href="/admin/merchants" className="hover:underline">← {t.nav.merchants}</Link>}
        title={m.businessName}
        description={<span className="flex flex-wrap items-center gap-2"><span className="font-mono font-semibold">{m.merchantCode}</span><StatusBadge status={m.status} label={L[m.status]} />{m.lead && <Link className="underline" href={`/admin/leads/${m.lead.id}`}>aplikasi</Link>}</span>}
        actions={can(actor, "merchant.suspend") ? (
          m.status === "SUSPENDED"
            ? <ActionButton action={merchantSuspendAction} args={{ merchantId: m.id, suspend: "false" }} label="Aktifkan kembali" variant="success" reason={{ label: "Alasan", minLength: 5 }} />
            : !["REFUNDED", "CANCELLED"].includes(m.status) && <ActionButton action={merchantSuspendAction} args={{ merchantId: m.id, suspend: "true" }} label="Tangguhkan merchant" variant="destructive" reason={{ label: "Alasan", minLength: 5 }} confirmBody="Komisi terkait merchant ini tertahan selama ditangguhkan." />
        ) : undefined}
      />
      <Card className="mb-6"><CardContent className="pt-5"><StageTimeline stage={m.status} labels={L} /></CardContent></Card>
      {m.statusReason && <div className="mb-6"><Alert variant="info" title="Catatan status">{m.statusReason}</Alert></div>}
      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Data merchant</CardTitle></CardHeader>
          <CardContent>
            <DescriptionList items={[
              { label: "Pemilik", value: m.ownerName }, { label: "Ponsel", value: m.phone }, { label: "Jenis usaha", value: m.businessType }, { label: "Alamat", value: `${m.addressLine}, ${m.city}, ${m.province}` },
              { label: "Disetujui", value: formatDateTime(m.approvedAt, locale) }, { label: "MID prosesor", value: m.processorMid ?? "—" }, { label: "Akun portal", value: m.user?.email ?? "Belum ada" },
            ]} />
            {!m.userId && can(actor, "merchant.review") && (
              <details className="mt-4 rounded-lg border p-3">
                <summary className="cursor-pointer text-sm font-semibold">Buat akun portal merchant</summary>
                <div className="mt-3">
                  <RevealOnceForm action={merchantPortalUserAction} hidden={{ merchantId: m.id }} submitLabel="Buat akun" labels={{ tempPassword: "Kata sandi sementara" }}>
                    <Field label="Email merchant" htmlFor="email"><Input id="email" name="email" type="email" required defaultValue={m.email ?? ""} /></Field>
                  </RevealOnceForm>
                </div>
              </details>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Atribusi agen</CardTitle><CardDescription>Perubahan tidak retroaktif: komisi lama tetap milik agen sebelumnya.</CardDescription></CardHeader>
          <CardContent className="grid gap-3 text-sm">
            <ul className="space-y-1">
              {m.attributions.map((a) => <li key={a.id}><Link className="font-semibold underline" href={`/admin/agents/${a.agent.id}`}>{a.agent.fullName} ({a.agent.agentCode})</Link> · {formatDateTime(a.effectiveFrom, locale)} → {a.effectiveTo ? formatDateTime(a.effectiveTo, locale) : "sekarang"} · <span className="text-muted-foreground">{a.reason}</span></li>)}
            </ul>
            {current && can(actor, "attribution.change") && <div><ActionButton action={changeAttributionAction} args={{ merchantId: m.id }} label="Ubah atribusi (Super Admin)" variant="outline" input={{ label: "Kode agen baru", placeholder: "HJA-000002" }} reason={{ label: "Alasan & referensi persetujuan", minLength: 10 }} /></div>}
          </CardContent>
        </Card>
      </div>
      {m.orders.map((o) => {
        const ev = events.find((e) => e.sourceOrderId === o.id);
        return (
          <Card key={o.id} className="mt-6">
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2">ORD-{o.orderNumber} · {o.product.name} <StatusBadge status={o.status} label={L[o.status]} /></CardTitle>
              <CardDescription>Harga {formatRupiah(o.unitPrice)} × {o.quantity} = {formatRupiah(o.totalAmount)} · dibuat {formatDateTime(o.createdAt, locale)}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-5 lg:grid-cols-3">
              <div className="grid content-start gap-2 text-sm">
                <h3 className="font-bold">1. Pembayaran</h3>
                {o.payments.length === 0 && <p className="text-muted-foreground">Belum ada bukti pembayaran dari agen.</p>}
                {o.payments.map((p) => (
                  <div key={p.id} className="rounded-lg border p-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">{p.method} · <span className="font-mono">{p.reference}</span> <StatusBadge status={p.status} label={L[p.status]} /></div>
                    <div>{formatRupiah(p.amount)} {p.proofFileId && <a className="underline" target="_blank" href={`/api/files/${p.proofFileId}`}>bukti</a>}</div>
                    {p.status === "SUBMITTED" && can(actor, "payment.verify") && (
                      <div className="mt-2 flex gap-2">
                        <ActionButton action={verifyPaymentAction} args={{ paymentId: p.id, decision: "VERIFIED" }} label="Verifikasi" variant="success" confirmTitle="Dana sudah diterima di rekening Hausjo?" />
                        <ActionButton action={verifyPaymentAction} args={{ paymentId: p.id, decision: "REJECTED" }} label="Tolak" variant="outline" confirmTitle="Tolak pembayaran ini?" />
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <div className="grid content-start gap-2 text-sm">
                <h3 className="font-bold">2. Penetapan perangkat</h3>
                {o.device ? <p>SN <span className="font-mono">{o.device.serialNumber}</span> · <StatusBadge status={o.device.status} label={L[o.device.status]} /></p> : o.status === "PAYMENT_VERIFIED" && can(actor, "device.manage") ? (
                  <ActionForm action={assignDeviceAction} hidden={{ orderId: o.id }} submitLabel="Tetapkan perangkat">
                    <Field label="Perangkat tersedia" htmlFor={`dev-${o.id}`}>
                      <NativeSelect id={`dev-${o.id}`} name="deviceId" required>{stock.filter((d) => d.productId === o.productId).map((d) => <option key={d.id} value={d.id}>{d.serialNumber}</option>)}</NativeSelect>
                    </Field>
                  </ActionForm>
                ) : <p className="text-muted-foreground">Menunggu pembayaran terverifikasi.</p>}
              </div>
              <div className="grid content-start gap-2 text-sm">
                <h3 className="font-bold">3. Aktivasi & komisi</h3>
                {o.activation ? (
                  <p>TID <span className="font-mono">{o.activation.terminalId}</span> · aktif {formatDateTime(o.activation.activatedAt, locale)}{o.activation.deactivatedAt && ` · nonaktif ${formatDateTime(o.activation.deactivatedAt, locale)}`}</p>
                ) : o.status === "DEVICE_ASSIGNED" && can(actor, "device.activate") ? (
                  <ActionForm action={activateDeviceAction} hidden={{ orderId: o.id }} submitLabel="Aktivasi">
                    <Field label="Terminal ID (dari prosesor)" htmlFor={`tid-${o.id}`}><Input id={`tid-${o.id}`} name="terminalId" required className="font-mono uppercase" /></Field>
                    <Field label="Waktu aktivasi (opsional)" htmlFor={`at-${o.id}`}><Input id={`at-${o.id}`} name="activatedAt" type="datetime-local" /></Field>
                  </ActionForm>
                ) : <p className="text-muted-foreground">Menunggu penetapan perangkat.</p>}
                {ev && <p>Komisi: <Link className="font-semibold underline" href={`/admin/commissions/${ev.id}`}>{formatRupiah(ev.amount)} → {ev.agent.agentCode}</Link> <StatusBadge status={ev.status} label={L[ev.status]} /></p>}
                {o.status === "ACTIVATED" && !ev && <Alert variant="warning">Tidak ada aturan komisi yang berlaku untuk produk ini pada tanggal penjualan.</Alert>}
                {!["REFUNDED", "CANCELLED"].includes(o.status) && can(actor, "order.refund") && o.payments.some((p) => p.status === "VERIFIED") && (
                  <div><ActionButton action={refundOrderAction} args={{ orderId: o.id }} label="Refund pesanan" variant="destructive" reason={{ label: "Alasan refund", minLength: 5 }} confirmBody="Pembayaran ditandai dikembalikan, perangkat kembali ke gudang, dan komisi penjualan dibatalkan (clawback jika sudah dibayar)." /></div>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
      <h2 className="mb-3 mt-8 text-lg font-bold">Transaksi (200 terbaru)</h2>
      <DataTable rows={serialize(txns.map((x) => ({ ...x, ref: `${x.source}:${x.externalId}` })))} locale={locale} statusLabels={L}
        columns={[
          { key: "ref", header: "Referensi", type: "mono" }, { key: "terminalId", header: "TID", type: "mono" }, { key: "type", header: "Jenis" }, { key: "status", header: "Status", type: "status" },
          { key: "amount", header: "Nominal", type: "money", align: "right" }, { key: "rewardStatus", header: "Imbalan", type: "status" }, { key: "occurredAt", header: "Waktu", type: "datetime" },
        ]} />
    </>
  );
}
