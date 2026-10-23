import { pageContext } from "@/server/page-auth";
import { prisma } from "@/server/db";
import { transactionsForMerchant } from "@/server/modules/transactions";
import { getDictionary } from "@/lib/i18n/server";
import { formatRupiah, serialize } from "@/lib/money";
import { formatDateTime } from "@/lib/time";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DescriptionList, Kpi, PageHeader } from "@/components/ui/misc";
import { StatusBadge } from "@/components/ui/status-badge";
import { DataTable } from "@/components/shared/data-table";
import { StageTimeline } from "@/components/shared/stage-timeline";

export const metadata = { title: "Portal merchant" };

/** Merchant sees only its own record, devices and transactions (no commission data). */
export default async function MerchantHome() {
  const { actor } = await pageContext("merchant");
  const { t, locale } = await getDictionary();
  const m = await prisma.merchant.findUniqueOrThrow({
    where: { id: actor.merchantId! },
    include: { devices: { include: { product: true } }, orders: { include: { product: true, activation: true }, orderBy: { createdAt: "asc" } } },
  });
  const txns = await transactionsForMerchant(actor, m.id, 300);
  const L = t.status as unknown as Record<string, string>;
  const success = txns.filter((x) => x.status === "SUCCESS");
  return (
    <>
      <PageHeader title={m.businessName} description={<span className="flex items-center gap-2"><span className="font-mono">{m.merchantCode}</span><StatusBadge status={m.status} label={L[m.status]} /></span>} />
      <Card className="mb-6"><CardHeader><CardTitle>Status onboarding</CardTitle></CardHeader><CardContent><StageTimeline stage={m.status} labels={L} /></CardContent></Card>
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Perangkat" value={m.devices.length} />
        <Kpi label="Transaksi berhasil (300 terbaru)" value={success.length} />
        <Kpi label="Nominal berhasil" value={formatRupiah(success.reduce((s, x) => s + x.amount, 0n))} />
        <Kpi label="Gagal / dibatalkan" value={txns.length - success.length} />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Data usaha</CardTitle></CardHeader>
          <CardContent><DescriptionList items={[{ label: "Pemilik", value: m.ownerName }, { label: "Alamat", value: `${m.addressLine}, ${m.city}, ${m.province}` }, { label: "Disetujui", value: formatDateTime(m.approvedAt, locale) }]} /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Perangkat</CardTitle></CardHeader>
          <CardContent>
            <ul className="divide-y text-sm">
              {m.orders.map((o) => <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 py-2"><span>{o.product.name} · ORD-{o.orderNumber}{o.activation && <> · TID <span className="font-mono">{o.activation.terminalId}</span></>}</span><StatusBadge status={o.status} label={L[o.status]} /></li>)}
            </ul>
          </CardContent>
        </Card>
      </div>
      <h2 className="mb-3 mt-8 text-lg font-bold">Riwayat transaksi</h2>
      <DataTable rows={serialize(txns.map((x) => ({ id: x.externalId, tid: x.terminalId, type: x.type, status: x.status, amount: x.amount, at: x.occurredAt, settlement: x.settlementRef ?? "—" })))} locale={locale} statusLabels={L}
        columns={[{ key: "id", header: "ID transaksi", type: "mono" }, { key: "tid", header: "TID", type: "mono" }, { key: "type", header: "Jenis" }, { key: "status", header: "Status", type: "status" }, { key: "amount", header: "Nominal", type: "money", align: "right" }, { key: "settlement", header: "Settlement", type: "mono" }, { key: "at", header: "Waktu", type: "datetime" }]} />
    </>
  );
}
