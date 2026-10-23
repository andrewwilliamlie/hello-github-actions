import { Download } from "lucide-react";
import { adminPage } from "@/server/page-auth";
import { getDictionary } from "@/lib/i18n/server";
import { parseRange } from "@/lib/range";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Laporan & ekspor" };

const KINDS = [
  ["agents", "Agen & saldo dompet", "Semua agen, status, kode referral, saldo tertunda/dapat ditarik/dibayar."],
  ["merchants", "Merchant", "ID merchant permanen, status, wilayah, agen teratribusi."],
  ["commissions", "Komisi", "Setiap komisi beserta versi aturan, status, penerima (berdasarkan tanggal dibuat)."],
  ["transactions", "Transaksi", "Transaksi ternormalisasi beserta status imbalan dan alasan (berdasarkan tanggal bisnis)."],
  ["withdrawals", "Penarikan", "Permintaan penarikan dan status pembayaran (rekening disamarkan)."],
] as const;

export default async function Reports({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  await adminPage("report.export");
  const { t } = await getDictionary();
  const range = parseRange(await searchParams);
  return (
    <>
      <PageHeader title={t.nav.reports} description="Ekspor CSV/Excel sesuai izin peran. Setiap ekspor dicatat dalam log audit. Data sensitif (NIK, nomor rekening lengkap) tidak pernah diekspor." />
      <form className="mb-6 flex flex-wrap items-end gap-2">
        <label className="grid gap-1 text-xs font-semibold">{t.common.from}<Input type="date" name="from" defaultValue={range.from} /></label>
        <label className="grid gap-1 text-xs font-semibold">{t.common.to}<Input type="date" name="to" defaultValue={range.to} /></label>
        <Button type="submit" variant="outline">{t.common.apply}</Button>
      </form>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {KINDS.map(([k, title, desc]) => (
          <Card key={k}>
            <CardHeader><CardTitle>{title}</CardTitle><CardDescription>{desc}</CardDescription></CardHeader>
            <CardContent className="flex gap-2">
              <Button asChild variant="outline" size="sm"><a href={`/admin/reports/export?kind=${k}&format=csv&from=${range.from}&to=${range.to}`}><Download />CSV</a></Button>
              <Button asChild variant="outline" size="sm"><a href={`/admin/reports/export?kind=${k}&format=xlsx&from=${range.from}&to=${range.to}`}><Download />Excel</a></Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}
