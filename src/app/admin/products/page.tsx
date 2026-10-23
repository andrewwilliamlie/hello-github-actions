import Link from "next/link";
import Image from "next/image";
import { Plus } from "lucide-react";
import { adminPage } from "@/server/page-auth";
import { listCatalog } from "@/server/modules/products";
import { getDictionary } from "@/lib/i18n/server";
import { formatRupiah } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/misc";
import { StatusBadge } from "@/components/ui/status-badge";

export const metadata = { title: "Katalog produk" };

export default async function Products() {
  await adminPage("product.manage");
  const { t } = await getDictionary();
  const catalog = await listCatalog();
  return (
    <>
      <PageHeader title={t.nav.products} description="Harga dan komisi berversi dengan tanggal berlaku. Komisi per SKU diatur di Aturan komisi." actions={<Button asChild><Link href="/admin/products/new"><Plus />Produk baru</Link></Button>} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {catalog.map((p) => (
          <Link key={p.id} href={`/admin/products/${p.id}`} className="flex gap-4 rounded-xl border bg-card p-4 shadow-sm hover:border-sky-300">
            {p.imageUrl ? <Image src={p.imageUrl} alt="" width={88} height={88} className="rounded-lg" /> : <div className="size-[88px] rounded-lg bg-muted" />}
            <div className="min-w-0 text-sm">
              <div className="flex flex-wrap items-center gap-2 font-bold">{p.name}{p.isDemo && <Badge variant="demo">Demo</Badge>}</div>
              <div className="font-mono text-xs text-muted-foreground">{p.sku}</div>
              <div className="mt-2">Harga: <b>{p.price !== null ? formatRupiah(p.price) : "—"}</b></div>
              <div>Komisi: <b>{p.commission !== null ? formatRupiah(p.commission) : "belum ada aturan"}</b> {p.commissionRule && <span className="font-mono text-xs">({p.commissionRule.code} v{p.commissionRule.version})</span>}</div>
              <div>Stok: <b>{p.stock}</b></div>
              <div className="mt-1"><StatusBadge status={p.isActive ? "ACTIVE" : "DISABLED"} label={p.isActive ? "Aktif" : "Nonaktif"} /></div>
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}
