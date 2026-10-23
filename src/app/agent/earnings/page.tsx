import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { pageContext } from "@/server/page-auth";
import { prisma } from "@/server/db";
import { getDictionary } from "@/lib/i18n/server";
import { parseRange } from "@/lib/range";
import { parseDateOnly } from "@/lib/time";
import { formatRupiah, serialize } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { Kpi, PageHeader } from "@/components/ui/misc";
import { DataTable } from "@/components/shared/data-table";

export const metadata = { title: "Pendapatan" };

const TYPES = ["SALES", "TRANSACTION_REWARD", "REFERRAL_SALES", "REFERRAL_TRANSACTION", "ADJUSTMENT"] as const;
const STATUSES = ["PENDING", "ELIGIBLE", "APPROVED", "PAYABLE", "PAID", "REVERSED", "DISPUTED"] as const;

export default async function AgentEarnings({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { actor } = await pageContext("agent");
  const { t, locale } = await getDictionary();
  const sp = await searchParams;
  const range = parseRange(sp, 90);
  const where: Prisma.CommissionEventWhereInput = {
    agentId: actor.agentId!,
    businessDate: { gte: parseDateOnly(range.from), lte: parseDateOnly(range.to) },
    ...(sp.type && TYPES.includes(sp.type as never) ? { type: sp.type as (typeof TYPES)[number] } : {}),
    ...(sp.status && STATUSES.includes(sp.status as never) ? { status: sp.status as (typeof STATUSES)[number] } : {}),
    ...(sp.merchantId ? { merchantId: sp.merchantId } : {}),
  };
  const [events, totals] = await Promise.all([
    prisma.commissionEvent.findMany({ where, orderBy: { occurredAt: "desc" }, take: 2000 }),
    prisma.commissionEvent.groupBy({ by: ["status"], where, _sum: { amount: true, deductedAmount: true } }),
  ]);
  const merchantIds = [...new Set(events.map((e) => e.merchantId).filter(Boolean))] as string[];
  const merchants = new Map((await prisma.merchant.findMany({ where: { id: { in: merchantIds } }, select: { id: true, businessName: true } })).map((m) => [m.id, m.businessName]));
  const sum = (s: string[]) => totals.filter((x) => s.includes(x.status)).reduce((a, x) => a + (x._sum.amount ?? 0n) - (x._sum.deductedAmount ?? 0n), 0n);
  const rows = events.map((e) => ({
    id: e.id, type: t.commissionType[e.type], eventRef: e.eventRef, merchant: e.merchantId ? merchants.get(e.merchantId) ?? "—" : "—", amount: e.amount - e.deductedAmount,
    status: e.status, businessDate: e.businessDate, rule: `${e.ruleCode ?? "—"} v${e.ruleVersion ?? "-"}`, isDemo: e.isDemo,
  }));
  return (
    <>
      <PageHeader title={t.nav.earnings} description="Setiap baris dapat dibuka untuk melihat sumber, tarif, penerima, dan versi aturan yang digunakan." />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label={t.agent.pending} value={formatRupiah(sum(["PENDING", "ELIGIBLE", "APPROVED", "DISPUTED"]))} hint="Dalam filter ini" />
        <Kpi label={t.agent.payable} value={formatRupiah(sum(["PAYABLE"]))} />
        <Kpi label={t.agent.paid} value={formatRupiah(sum(["PAID"]))} />
        <Kpi label={t.status.REVERSED} value={formatRupiah(sum(["REVERSED"]))} />
      </div>
      <form className="mb-4 grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-5">
        <label className="grid gap-1 text-xs font-semibold">{t.common.from}<Input type="date" name="from" defaultValue={range.from} /></label>
        <label className="grid gap-1 text-xs font-semibold">{t.common.to}<Input type="date" name="to" defaultValue={range.to} /></label>
        <label className="grid gap-1 text-xs font-semibold">{t.agent.source}<NativeSelect name="type" defaultValue={sp.type ?? ""}><option value="">{t.common.all}</option>{TYPES.map((x) => <option key={x} value={x}>{t.commissionType[x]}</option>)}</NativeSelect></label>
        <label className="grid gap-1 text-xs font-semibold">{t.common.status}<NativeSelect name="status" defaultValue={sp.status ?? ""}><option value="">{t.common.all}</option>{STATUSES.map((x) => <option key={x} value={x}>{t.status[x]}</option>)}</NativeSelect></label>
        <div className="flex items-end gap-2">{sp.merchantId && <input type="hidden" name="merchantId" value={sp.merchantId} />}<Button type="submit" className="flex-1">{t.common.apply}</Button><Button asChild variant="outline"><Link href="/agent/earnings">{t.common.reset}</Link></Button></div>
      </form>
      <DataTable
        rows={serialize(rows)} locale={locale} statusLabels={t.status as unknown as Record<string, string>} searchPlaceholder={t.common.search} emptyTitle="Belum ada pendapatan pada periode ini"
        columns={[
          { key: "type", header: "Jenis", type: "link", href: "/agent/earnings/{id}", sub: "eventRef" },
          { key: "merchant", header: "Merchant" },
          { key: "businessDate", header: "Tanggal", type: "bizdate" },
          { key: "rule", header: "Aturan", type: "mono" },
          { key: "status", header: "Status", type: "status" },
          { key: "amount", header: "Jumlah", type: "money", align: "right" },
          { key: "isDemo", header: "", type: "demo", sortable: false },
        ]}
      />
    </>
  );
}
