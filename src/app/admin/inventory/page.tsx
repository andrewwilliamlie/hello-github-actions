import type { DeviceStatus } from "@prisma/client";
import { adminPage } from "@/server/page-auth";
import { prisma } from "@/server/db";
import { getDictionary } from "@/lib/i18n/server";
import { serialize } from "@/lib/money";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Kpi, PageHeader } from "@/components/ui/misc";
import { Field } from "@/components/ui/label";
import { NativeSelect, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ActionForm } from "@/components/shared/action-form";
import { ActionButton } from "@/components/shared/action-button";
import { DataTable } from "@/components/shared/data-table";
import { faultyDeviceAction, receiveDevicesAction } from "../actions";

export const metadata = { title: "Inventaris" };
const ALL: DeviceStatus[] = ["IN_STOCK", "ASSIGNED", "ACTIVE", "RETURNED", "FAULTY", "RETIRED"];

export default async function Inventory({ searchParams }: { searchParams: Promise<{ status?: string; productId?: string }> }) {
  await adminPage("device.manage");
  const { t, locale } = await getDictionary();
  const sp = await searchParams;
  const [products, counts, devices, movements] = await Promise.all([
    prisma.product.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" } }),
    prisma.device.groupBy({ by: ["status"], _count: true }),
    prisma.device.findMany({
      where: { ...(ALL.includes(sp.status as DeviceStatus) ? { status: sp.status as DeviceStatus } : {}), ...(sp.productId ? { productId: sp.productId } : {}) },
      include: { product: { select: { name: true } }, merchant: { select: { businessName: true, merchantCode: true } } }, orderBy: { serialNumber: "asc" }, take: 3000,
    }),
    prisma.inventoryMovement.findMany({ orderBy: { createdAt: "desc" }, take: 50, include: { device: { select: { serialNumber: true } } } }),
  ]);
  const c = (s: DeviceStatus) => counts.find((x) => x.status === s)?._count ?? 0;
  const L = t.status as unknown as Record<string, string>;
  return (
    <>
      <PageHeader title={t.nav.inventory} description="Perangkat berseri. Satu perangkat hanya dapat ditetapkan ke satu pesanan dan aktif di satu merchant." />
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">{ALL.map((s) => <Kpi key={s} label={L[s]} value={c(s)} />)}</div>
      <div className="grid gap-6 xl:grid-cols-[1fr_2fr]">
        <div className="grid h-fit gap-6">
          <Card>
            <CardHeader><CardTitle>Terima perangkat</CardTitle><CardDescription>Satu nomor seri per baris. Duplikat otomatis dilewati.</CardDescription></CardHeader>
            <CardContent>
              <ActionForm action={receiveDevicesAction} submitLabel="Tambahkan ke stok">
                <Field label="Produk" htmlFor="productId"><NativeSelect id="productId" name="productId" required>{products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</NativeSelect></Field>
                <Field label="Nomor seri" htmlFor="serials"><Textarea id="serials" name="serials" rows={5} className="font-mono" required /></Field>
              </ActionForm>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Pergerakan terbaru</CardTitle></CardHeader>
            <CardContent>
              <ul className="space-y-1 text-xs">{movements.map((m) => <li key={m.id}><span className="font-mono">{m.device.serialNumber}</span> · {m.type} · {m.fromStatus ?? "—"} → {m.toStatus}{m.note ? ` · ${m.note}` : ""}</li>)}</ul>
            </CardContent>
          </Card>
        </div>
        <div>
          <form className="mb-3 flex flex-wrap items-end gap-2">
            <NativeSelect name="productId" defaultValue={sp.productId ?? ""} className="w-48" aria-label="Produk"><option value="">Semua produk</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</NativeSelect>
            <NativeSelect name="status" defaultValue={sp.status ?? ""} className="w-48" aria-label="Status"><option value="">Semua status</option>{ALL.map((s) => <option key={s} value={s}>{L[s]}</option>)}</NativeSelect>
            <Button type="submit" variant="outline">{t.common.apply}</Button>
          </form>
          <DataTable rows={serialize(devices.map((d) => ({ id: d.id, serial: d.serialNumber, product: d.product.name, status: d.status, tid: d.terminalId ?? "—", merchant: d.merchant ? `${d.merchant.businessName} (${d.merchant.merchantCode})` : "—", demo: d.isDemo })))} locale={locale} statusLabels={L}
            columns={[{ key: "serial", header: "Nomor seri", type: "mono" }, { key: "product", header: "Produk" }, { key: "status", header: "Status", type: "status" }, { key: "tid", header: "TID", type: "mono" }, { key: "merchant", header: "Merchant" }, { key: "demo", header: "", type: "demo" }]} />
          {devices.some((d) => d.status === "RETURNED") && (
            <Card className="mt-4">
              <CardHeader><CardTitle>Perangkat dikembalikan</CardTitle><CardDescription>Periksa lalu tandai rusak bila perlu.</CardDescription></CardHeader>
              <CardContent className="flex flex-wrap gap-2">{devices.filter((d) => d.status === "RETURNED").map((d) => <ActionButton key={d.id} action={faultyDeviceAction} args={{ deviceId: d.id }} label={`Rusak: ${d.serialNumber}`} variant="outline" reason={{ label: "Catatan kerusakan", minLength: 3 }} />)}</CardContent>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
