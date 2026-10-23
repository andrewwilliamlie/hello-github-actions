import Link from "next/link";
import { Coins, Plus, Store, Users } from "lucide-react";
import { pageContext } from "@/server/page-auth";
import { agentDashboard } from "@/server/modules/reports";
import { prisma } from "@/server/db";
import { env } from "@/server/env";
import { getDictionary } from "@/lib/i18n/server";
import { parseRange, eachDay } from "@/lib/range";
import { formatRupiah } from "@/lib/money";
import { formatDateTime } from "@/lib/time";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, Kpi, PageHeader, EmptyState } from "@/components/ui/misc";
import { Input, NativeSelect } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { StackedTimeChart, LineTimeChart } from "@/components/charts/charts";
import { ReferralShare } from "@/components/shared/referral-share";

export const metadata = { title: "Dasbor Agen" };

export default async function AgentDashboard({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { actor } = await pageContext("agent");
  const { t, locale } = await getDictionary();
  const sp = await searchParams;
  const range = parseRange(sp);
  const filters = { ...range, merchantId: sp.merchantId || undefined, productId: sp.productId || undefined, source: sp.source || undefined };
  const agent = await prisma.agent.findUniqueOrThrow({ where: { id: actor.agentId! } });
  const [d, merchants, products] = await Promise.all([
    agentDashboard(actor, filters),
    prisma.merchant.findMany({ where: { attributions: { some: { agentId: agent.id, effectiveTo: null } } }, select: { id: true, businessName: true }, orderBy: { businessName: "asc" } }),
    prisma.product.findMany({ where: { deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const A = t.agent;
  const days = eachDay(range.from, range.to);
  const types = ["SALES", "TRANSACTION_REWARD", "REFERRAL_SALES", "REFERRAL_TRANSACTION"] as const;
  const earningsSeries = days.map((day) => {
    const row: Record<string, number | string> = { day };
    for (const ty of types) row[ty] = d.trend.filter((x) => x.day === day && x.type === ty).reduce((s, x) => s + x.total, 0);
    return row;
  });
  const hasEarnings = d.trend.length > 0;
  const txSeries = days.map((day) => {
    const x = d.txTrend.find((r) => r.day === day);
    return { day, n: x?.n ?? 0, eligible: x?.eligible ?? 0 };
  });
  const link = `${env().APP_URL}/r/${agent.referralCode}`;

  return (
    <>
      <PageHeader
        title={`${A.welcome}, ${agent.fullName.split(" ")[0]}`}
        description={<span>{agent.agentCode} · <StatusBadge status={agent.status} label={t.status[agent.status as keyof typeof t.status]} /></span>}
        actions={agent.status === "ACTIVE" ? <Button asChild><Link href="/agent/merchants/new"><Plus />{A.onboardMerchant}</Link></Button> : null}
      />
      {agent.status !== "ACTIVE" && (
        <div className="mb-6"><Alert variant="warning" title={t.status[agent.status as keyof typeof t.status]}>{A.pendingBanner} <Link href="/agent/onboarding" className="font-semibold underline">{t.nav.onboarding}</Link></Alert></div>
      )}

      <form className="mb-6 grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-6" aria-label={A.filters}>
        <label className="grid gap-1 text-xs font-semibold">{t.common.from}<Input type="date" name="from" defaultValue={range.from} /></label>
        <label className="grid gap-1 text-xs font-semibold">{t.common.to}<Input type="date" name="to" defaultValue={range.to} /></label>
        <label className="grid gap-1 text-xs font-semibold">{A.merchant}
          <NativeSelect name="merchantId" defaultValue={filters.merchantId ?? ""}><option value="">{t.common.all}</option>{merchants.map((m) => <option key={m.id} value={m.id}>{m.businessName}</option>)}</NativeSelect>
        </label>
        <label className="grid gap-1 text-xs font-semibold">{A.product}
          <NativeSelect name="productId" defaultValue={filters.productId ?? ""}><option value="">{t.common.all}</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</NativeSelect>
        </label>
        <label className="grid gap-1 text-xs font-semibold">{A.source}
          <NativeSelect name="source" defaultValue={filters.source ?? ""}><option value="">{t.common.all}</option>{types.map((ty) => <option key={ty} value={ty}>{t.commissionType[ty]}</option>)}</NativeSelect>
        </label>
        <div className="flex items-end gap-2"><Button type="submit" className="flex-1">{t.common.apply}</Button><Button asChild variant="outline"><Link href="/agent">{t.common.reset}</Link></Button></div>
      </form>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi highlight label={A.totalEarnings} value={formatRupiah(d.totals.totalEarnings)} hint={`${range.from} – ${range.to}`} icon={<Coins className="size-4" />} />
        <Kpi label={A.pending} value={formatRupiah(d.wallet.pendingBalance)} hint="Masa tinjauan" />
        <Kpi label={A.payable} value={formatRupiah(d.wallet.payableBalance)} hint={d.wallet.reservedBalance > 0n ? `${A.reserved}: ${formatRupiah(d.wallet.reservedBalance)}` : undefined} />
        <Kpi label={A.paid} value={formatRupiah(d.wallet.paidTotal)} hint={d.wallet.receivableBalance > 0n ? `${A.receivable}: ${formatRupiah(d.wallet.receivableBalance)}` : undefined} />
        <Kpi label={A.directSales} value={d.totals.directSales.toLocaleString("id-ID")} hint={formatRupiah(d.totals.salesCommission)} />
        <Kpi label={A.activeMerchants} value={d.totals.activeMerchants.toLocaleString("id-ID")} icon={<Store className="size-4" />} />
        <Kpi label={A.merchantTx} value={d.totals.merchantTransactions.toLocaleString("id-ID")} hint={`${A.eligibleTx}: ${d.totals.eligibleTransactions.toLocaleString("id-ID")}`} />
        <Kpi label={A.recurringRewards} value={formatRupiah(d.totals.recurringRewards)} />
        <Kpi label={A.referralRewards} value={formatRupiah(d.totals.referralRewards)} />
        <Kpi label={A.activeRecruits} value={d.totals.activeRecruits.toLocaleString("id-ID")} icon={<Users className="size-4" />} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <StackedTimeChart title={A.earningsTrend} description="Per tanggal bisnis (WIB), tidak termasuk komisi yang dibatalkan" data={hasEarnings ? earningsSeries : []} series={types.map((ty) => ({ key: ty, label: t.commissionType[ty] }))} />
        <LineTimeChart title={A.txTrend} data={d.txTrend.length ? txSeries : []} series={[{ key: "n", label: "Transaksi berhasil" }, { key: "eligible", label: A.eligibleTx }]} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader><CardTitle>{A.merchantRanking}</CardTitle></CardHeader>
          <CardContent>
            {d.merchants.length === 0 ? (
              <EmptyState title="Belum ada merchant" body="Daftarkan merchant pertama Anda untuk mulai memperoleh komisi." action={agent.status === "ACTIVE" ? <Button asChild size="sm"><Link href="/agent/merchants/new">{A.onboardMerchant}</Link></Button> : undefined} />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm tabular">
                  <thead><tr className="border-b text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground"><th className="py-2">#</th><th>Merchant</th><th className="text-right">Transaksi</th><th className="text-right">{A.eligibleTx}</th><th className="text-right">Pendapatan</th></tr></thead>
                  <tbody>
                    {d.merchants.map((m, i) => (
                      <tr key={m.merchantId} className="border-b last:border-0">
                        <td className="py-2 text-muted-foreground">{i + 1}</td>
                        <td><div className="font-semibold">{m.businessName}</div><div className="font-mono text-xs text-muted-foreground">{m.merchantCode}</div></td>
                        <td className="text-right">{m.txns.toLocaleString("id-ID")}</td>
                        <td className="text-right">{m.eligible.toLocaleString("id-ID")}</td>
                        <td className="text-right font-semibold">{formatRupiah(m.earnings)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>{A.referralBox}</CardTitle></CardHeader>
          <CardContent>{agent.status === "ACTIVE" ? <ReferralShare code={agent.referralCode} link={link} compact /> : <p className="text-sm text-muted-foreground">Tautan rekrutmen aktif setelah akun Anda disetujui.</p>}</CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader><CardTitle>{A.activity}</CardTitle></CardHeader>
        <CardContent>
          {d.recent.length === 0 ? <EmptyState title={t.common.noData} /> : (
            <ul className="divide-y">
              {d.recent.map((e) => (
                <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <div className="min-w-0">
                    <Link href={`/agent/earnings/${e.id}`} className="font-semibold hover:underline">{t.commissionType[e.type]}</Link>
                    <div className="text-xs text-muted-foreground">{formatDateTime(e.createdAt, locale)} · <span className="font-mono">{e.eventRef.slice(0, 20)}</span></div>
                  </div>
                  <div className="flex items-center gap-3"><StatusBadge status={e.status} label={t.status[e.status as keyof typeof t.status]} /><span className="font-bold tabular">{formatRupiah(e.amount - e.deductedAmount)}</span></div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}
