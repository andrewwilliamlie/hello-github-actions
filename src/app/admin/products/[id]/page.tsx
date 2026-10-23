import Link from "next/link";
import { notFound } from "next/navigation";
import { adminPage } from "@/server/page-auth";
import { prisma } from "@/server/db";
import { getDictionary } from "@/lib/i18n/server";
import { formatRupiah } from "@/lib/money";
import { formatDateTime, businessDateString } from "@/lib/time";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { Field } from "@/components/ui/label";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { ActionForm } from "@/components/shared/action-form";
import { saveProductAction, setPriceAction } from "../../actions";

export const metadata = { title: "Produk" };

export default async function ProductEdit({ params }: { params: Promise<{ id: string }> }) {
  await adminPage("product.manage");
  const { t, locale } = await getDictionary();
  const { id } = await params;
  const isNew = id === "new";
  const p = isNew ? null : await prisma.product.findUnique({ where: { id }, include: { prices: { orderBy: { effectiveFrom: "desc" } }, rules: { orderBy: [{ code: "asc" }, { version: "desc" }] } } });
  if (!isNew && !p) notFound();
  const specs = ((p?.specs ?? []) as { label: string; value: string }[]).map((s) => `${s.label}: ${s.value}`).join("\n");
  return (
    <>
      <PageHeader eyebrow={<Link href="/admin/products" className="hover:underline">← {t.nav.products}</Link>} title={p?.name ?? "Produk baru"} />
      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Data produk</CardTitle></CardHeader>
          <CardContent>
            <ActionForm action={saveProductAction} hidden={{ id: p?.id ?? "" }} submitLabel="Simpan produk" resetOnSuccess={false} redirectTo={isNew ? "/admin/products" : undefined}>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="SKU" htmlFor="sku"><Input id="sku" name="sku" defaultValue={p?.sku} required className="font-mono uppercase" /></Field>
                <Field label="Nama" htmlFor="name"><Input id="name" name="name" defaultValue={p?.name} required /></Field>
                <Field label="Kategori" htmlFor="category"><NativeSelect id="category" name="category" defaultValue={p?.category ?? "EDC_ANDROID"}><option value="EDC_ANDROID">EDC Android</option><option value="EDC_MOBILE">EDC Mobile</option><option value="SOUNDBOX">Soundbox</option></NativeSelect></Field>
                <Field label="Gambar (path lokal)" htmlFor="imageUrl" hint="mis. /products/a920pro.svg"><Input id="imageUrl" name="imageUrl" defaultValue={p?.imageUrl ?? ""} /></Field>
              </div>
              <Field label="Deskripsi" htmlFor="description"><Textarea id="description" name="description" defaultValue={p?.description} required /></Field>
              <Field label="Spesifikasi (satu per baris, format Label: Nilai)" htmlFor="specs"><Textarea id="specs" name="specs" rows={5} defaultValue={specs} /></Field>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isActive" defaultChecked={p?.isActive ?? true} className="size-4" /> Aktif dijual</label>
            </ActionForm>
          </CardContent>
        </Card>
        {p && (
          <div className="grid h-fit gap-6">
            <Card>
              <CardHeader><CardTitle>Harga jual</CardTitle><CardDescription>Versi harga baru menutup harga aktif pada tanggal berlaku. Pesanan menyimpan salinan harga.</CardDescription></CardHeader>
              <CardContent className="grid gap-4">
                <ul className="divide-y text-sm">{p.prices.map((pr) => <li key={pr.id} className="flex justify-between py-1.5"><b>{formatRupiah(pr.priceIdr)}</b><span className="text-muted-foreground">{formatDateTime(pr.effectiveFrom, locale)} → {pr.effectiveTo ? formatDateTime(pr.effectiveTo, locale) : "sekarang"}</span></li>)}</ul>
                <ActionForm action={setPriceAction} hidden={{ productId: p.id }} submitLabel="Jadwalkan harga baru" variant="secondary">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Harga (Rp)" htmlFor="price"><Input id="price" name="price" inputMode="numeric" required /></Field>
                    <Field label="Berlaku mulai" htmlFor="effectiveFrom"><Input id="effectiveFrom" name="effectiveFrom" type="date" defaultValue={businessDateString(new Date())} required /></Field>
                  </div>
                </ActionForm>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Aturan komisi untuk SKU ini</CardTitle></CardHeader>
              <CardContent>
                <ul className="divide-y text-sm">{p.rules.map((r) => <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5"><span className="font-mono">{r.code} v{r.version}</span><span>{r.fixedAmount !== null ? formatRupiah(r.fixedAmount) : "—"}</span><StatusBadge status={r.status} label={t.status[r.status as keyof typeof t.status]} /></li>)}</ul>
                <Link href="/admin/rules" className="mt-3 inline-block text-sm font-semibold underline">Kelola aturan komisi</Link>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </>
  );
}
