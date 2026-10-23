import Link from "next/link";
import { AlertTriangle, Download } from "lucide-react";
import { pageContext } from "@/server/page-auth";
import { adminDashboard } from "@/server/modules/reports";
import { can } from "@/server/rbac";
import { getDictionary } from "@/lib/i18n/server";
import { parseRange, eachDay } from "@/lib/range";
import { formatRupiah } from "@/lib/money";
import { formatDateTime } from "@/lib/time";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, Kpi, PageHeader } from "@/components/ui/misc";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { HBarChart, LineTimeChart } from "@/components/charts/charts";

export const metadata = { title: "Dasbor Admin" };

export default async function AdminDashboard({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; forbidden?: string }> }) {
  const { actor } = await pageContext("admin");
  const { t, locale } = await getDictionary();
  const sp = await searchParams;
  if (!can(actor, "report.view")) return <Alert variant="warning">Anda tidak memiliki akses ke dasbor.</Alert>;
  const range = parseRange(sp);
  const d = await adminDashboard(actor, range);
  const A = t.admin;
  const L = t.status as unknown as Record<string, string>;
  const trend = eachDay(range.from, range.to).map((day) => {
    const r = d.recruitTrend.find((x) => x.day === day);
    return { day, total: r?.total ?? 0, referred: r?.referred ?? 0 };
  });
  const liabilities = d.liabilities.pending + d.liabilities.payable + d.liabilities.reserved;
  return (
    <>
      <PageHeader
        title={t.nav.dashboard}
        description={`Periode ${range.from} – ${range.to} (WIB)`}
        actions={
          <form className="flex flex-wrap items-end gap-2">
            <label className="grid gap-1 text-xs font-semibold">{t.common.from}<Input type="date" name="from" defaultValue={range.from} /></label>
            <label className="grid gap-1 text-xs font-semibold">{t.common.to}<Input type="date" name="to" defaultValue={range.to} /></label>
            <Button type="submit" variant="outline">{t.common.apply}</Button>
            {can(actor, "report.export") && <Button asChild variant="secondary"><Link href={`/admin/reports?from=${range.from}&to=${range.to}`}><Download />{t.common.export}</Link></Button>}
          </form>
        }
      />
      {sp.forbidden && <div className="mb-4"><Alert variant="warning">Anda tidak memiliki izin untuk halaman tersebut.</Alert></div>}
      {d.demoRules > 0 && <div className="mb-4"><Alert variant="warning" title={`${d.demoRules} ${A.demoRulesWarning}`}><Link href="/admin/rules" className="underline">{t.nav.rules}</Link></Alert></div>}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi label={A.registeredAgents} value={d.agents.total} hint={`${d.agents.pending} menunggu · ${d.agents.suspended} ditangguhkan`} />
        <Kpi label={A.activeAgents} value={d.agents.active} />
        <Kpi label={A.newAgents} value={d.agents.new} hint="Dalam periode" />
        <Kpi label={A.totalMerchants} value={d.merchants.total} />
        <Kpi label={A.activatedDevices} value={d.activatedDevices} />
        <Kpi label={A.eligibleTx} value={d.eligibleTxns.toLocaleString("id-ID")} hint="Diberi imbalan, dalam periode" />
        <Kpi highlight label={A.liabilities} value={formatRupiah(liabilities)} hint={`Tertunda ${formatRupiah(d.liabilities.pending)} · dapat ditarik ${formatRupiah(d.liabilities.payable)}`} />
        <Kpi label={A.paidCommissions} value={formatRupiah(d.liabilities.paid)} hint="Sepanjang waktu" />
        <Kpi label={A.pendingPayouts} value={formatRupiah(d.openWithdrawals.amount)} hint={`${d.openWithdrawals.count} penarikan terbuka`} />
        <Kpi label="Piutang clawback" value={formatRupiah(d.liabilities.receivable)} />
        <Kpi label={A.fraudFlags} value={d.fraudOpen} icon={d.fraudOpen ? <AlertTriangle className="size-4 text-amber-600" /> : undefined} />
        <Kpi label={A.reconStatus} value={d.reconciliation.openExceptions} hint={d.reconciliation.lastRun ? `Terakhir ${formatDateTime(d.reconciliation.lastRun.startedAt, locale)}` : "Belum pernah dijalankan"} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <LineTimeChart title={A.recruitmentTrend} description="Pendaftaran agen per hari; garis kedua = mendaftar dengan kode referral" data={d.recruitTrend.length ? trend : []} series={[{ key: "total", label: "Semua pendaftaran" }, { key: "referred", label: "Melalui referral" }]} />
        <HBarChart title={A.funnel} description="Jumlah kumulatif yang mencapai tiap tahap" data={d.funnel.map((f) => ({ name: L[f.stage] ?? f.stage, value: f.value }))} label="Jumlah" ordinal />
        <HBarChart title={A.productSales} description="Pesanan dalam periode (tidak termasuk yang dibatalkan)" data={d.productPerf.map((p) => ({ name: p.name, value: p.sold }))} label="Pesanan" />
        <HBarChart title={A.geo} description="Merchant per provinsi" data={d.geo.map((g) => ({ name: g.province, value: g.merchants }))} label="Merchant" />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>{A.topAgents}</CardTitle><CardDescription>Berdasarkan komisi bersih (tidak termasuk yang dibatalkan) dalam periode</CardDescription></CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm tabular">
              <thead><tr className="border-b text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground"><th className="py-2">Agen</th><th>Kota</th><th className="text-right">Penjualan</th><th className="text-right">Merchant</th><th className="text-right">Komisi</th></tr></thead>
              <tbody>
                {d.topAgents.map((a) => (
                  <tr key={a.id} className="border-b last:border-0">
                    <td className="py-2"><Link href={`/admin/agents/${a.id}`} className="font-semibold hover:underline">{a.fullName}</Link><div className="font-mono text-xs text-muted-foreground">{a.agentCode}</div></td>
                    <td>{a.city}</td><td className="text-right">{a.sales}</td><td className="text-right">{a.merchants}</td><td className="text-right font-semibold">{formatRupiah(a.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>{A.productPerformance}</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm tabular">
              <thead><tr className="border-b text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground"><th className="py-2">Produk</th><th className="text-right">Dipesan</th><th className="text-right">Aktif</th><th className="text-right">Pendapatan</th><th className="text-right">Komisi</th></tr></thead>
              <tbody>
                {d.productPerf.map((p) => (
                  <tr key={p.sku} className="border-b last:border-0"><td className="py-2 font-semibold">{p.name}</td><td className="text-right">{p.sold}</td><td className="text-right">{p.activated}</td><td className="text-right">{formatRupiah(p.revenue)}</td><td className="text-right">{formatRupiah(p.commission)}</td></tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>{A.cohorts}</CardTitle><CardDescription>Agen per bulan pendaftaran: berapa yang aktif dan sudah memiliki penjualan teraktivasi</CardDescription></CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm tabular">
              <thead><tr className="border-b text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground"><th className="py-2">Kohort</th><th className="text-right">Agen</th><th className="text-right">Aktif</th><th className="text-right">Dengan penjualan</th><th className="text-right">Konversi</th></tr></thead>
              <tbody>
                {d.cohorts.map((c) => (
                  <tr key={c.cohort} className="border-b last:border-0"><td className="py-2 font-mono">{c.cohort}</td><td className="text-right">{c.agents}</td><td className="text-right">{c.active}</td><td className="text-right">{c.withSale}</td><td className="text-right">{c.agents ? Math.round((c.withSale / c.agents) * 100) : 0}%</td></tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>{A.reconStatus}</CardTitle></CardHeader>
          <CardContent className="grid gap-3 text-sm">
            {d.reconciliation.lastRun ? (
              <div className="flex flex-wrap items-center gap-2">Run terakhir: <StatusBadge status={d.reconciliation.lastRun.status} label={L[d.reconciliation.lastRun.status]} /> {formatDateTime(d.reconciliation.lastRun.startedAt, locale)}</div>
            ) : <p className="text-muted-foreground">Belum ada run rekonsiliasi.</p>}
            <div>Pengecualian terbuka: <b>{d.reconciliation.openExceptions}</b></div>
            <div className="flex gap-2"><Button asChild size="sm" variant="outline"><Link href="/admin/reconciliation">{t.nav.reconciliation}</Link></Button><Button asChild size="sm" variant="outline"><Link href="/admin/withdrawals">{t.nav.withdrawals}</Link></Button></div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
