import type { CommissionStatus, CommissionType, Prisma } from "@prisma/client";
import { adminPage } from "@/server/page-auth";
import { prisma } from "@/server/db";
import { can } from "@/server/rbac";
import { getDictionary } from "@/lib/i18n/server";
import { formatRupiah, serialize } from "@/lib/money";
import { parseRange } from "@/lib/range";
import { parseDateOnly } from "@/lib/time";
import { Kpi, PageHeader, Alert } from "@/components/ui/misc";
import { Input, NativeSelect } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/shared/data-table";
import { ActionButton } from "@/components/shared/action-button";
import { approveCommissionAction, releaseAction } from "../actions";

export const metadata = { title: "Komisi" };
const TYPES: CommissionType[] = ["SALES", "TRANSACTION_REWARD", "REFERRAL_SALES", "REFERRAL_TRANSACTION"];
const STATUSES: CommissionStatus[] = ["PENDING", "ELIGIBLE", "APPROVED", "PAYABLE", "PAID", "REVERSED", "DISPUTED"];

export default async function AdminCommissions({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { actor } = await adminPage("commission.view");
  const { t, locale } = await getDictionary();
  const sp = await searchParams;
  const range = parseRange(sp, 30);
  const where: Prisma.CommissionEventWhereInput = {
    businessDate: { gte: parseDateOnly(range.from), lte: parseDateOnly(range.to) },
    ...(TYPES.includes(sp.type as CommissionType) ? { type: sp.type as CommissionType } : {}),
    ...(STATUSES.includes(sp.status as CommissionStatus) ? { status: sp.status as CommissionStatus } : {}),
  };
  const [events, totals, awaitingApproval] = await Promise.all([
    prisma.commissionEvent.findMany({ where, include: { agent: { select: { fullName: true, agentCode: true } } }, orderBy: { createdAt: "desc" }, take: 3000 }),
    prisma.commissionEvent.groupBy({ by: ["status"], where, _sum: { amount: true, deductedAmount: true }, _count: true }),
    prisma.commissionEvent.findMany({ where: { status: "ELIGIBLE" }, select: { id: true, ruleSnapshot: true } }),
  ]);
  const manual = awaitingApproval.filter((e) => (e.ruleSnapshot as { requiresManualApproval?: boolean }).requiresManualApproval).map((e) => e.id);
  const sum = (s: CommissionStatus) => { const r = totals.find((x) => x.status === s); return { amt: (r?._sum.amount ?? 0n) - (r?._sum.deductedAmount ?? 0n), n: r?._count ?? 0 }; };
  const L = t.status as unknown as Record<string, string>;
  const rows = events.map((e) => ({ id: e.id, type: t.commissionType[e.type], ref: e.eventRef, agent: e.agent.fullName, agentCode: e.agent.agentCode, status: e.status, amount: e.amount - e.deductedAmount, rule: `${e.ruleCode} v${e.ruleVersion}`, date: e.businessDate, holdUntil: e.holdUntil, demo: e.isDemo }));
  return (
    <>
      <PageHeader
        title={t.nav.commissions}
        description="Semua komisi dengan rujukan sumber unik. Pembatalan dicatat sebagai jurnal; nominal komisi tidak pernah diubah."
        actions={can(actor, "commission.release") ? <ActionButton action={releaseAction} label="Jalankan rilis sekarang" variant="secondary" size="default" confirmTitle="Jalankan rilis komisi?" confirmBody="Memindahkan komisi yang masa tinjauannya selesai dan tanpa hambatan ke status dapat ditarik. Proses ini juga berjalan otomatis setiap 15 menit oleh worker." /> : undefined}
      />
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">{STATUSES.map((s) => <Kpi key={s} label={L[s]} value={formatRupiah(sum(s).amt)} hint={`${sum(s).n} komisi`} />)}</div>
      {manual.length > 0 && can(actor, "commission.approve") && (
        <div className="mb-4"><Alert variant="info" title={`${manual.length} komisi menunggu persetujuan manual Finance`}><div className="mt-2"><ActionButton action={approveCommissionAction} args={{ ids: manual.join(",") }} label={`Setujui ${manual.length} komisi`} variant="success" confirmTitle="Setujui semua komisi yang menunggu persetujuan?" /></div></Alert></div>
      )}
      <form className="mb-4 grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-5">
        <label className="grid gap-1 text-xs font-semibold">{t.common.from}<Input type="date" name="from" defaultValue={range.from} /></label>
        <label className="grid gap-1 text-xs font-semibold">{t.common.to}<Input type="date" name="to" defaultValue={range.to} /></label>
        <label className="grid gap-1 text-xs font-semibold">Jenis<NativeSelect name="type" defaultValue={sp.type ?? ""}><option value="">{t.common.all}</option>{TYPES.map((x) => <option key={x} value={x}>{t.commissionType[x]}</option>)}</NativeSelect></label>
        <label className="grid gap-1 text-xs font-semibold">{t.common.status}<NativeSelect name="status" defaultValue={sp.status ?? ""}><option value="">{t.common.all}</option>{STATUSES.map((x) => <option key={x} value={x}>{L[x]}</option>)}</NativeSelect></label>
        <div className="flex items-end"><Button type="submit" className="w-full">{t.common.apply}</Button></div>
      </form>
      <DataTable rows={serialize(rows)} locale={locale} statusLabels={L}
        columns={[
          { key: "type", header: "Jenis", type: "link", href: "/admin/commissions/{id}", sub: "ref" }, { key: "agent", header: "Penerima", sub: "agentCode" }, { key: "rule", header: "Aturan", type: "mono" },
          { key: "date", header: "Tanggal", type: "bizdate" }, { key: "holdUntil", header: "Tinjauan s.d.", type: "datetime" }, { key: "status", header: "Status", type: "status" },
          { key: "amount", header: "Jumlah", type: "money", align: "right" }, { key: "demo", header: "", type: "demo", sortable: false },
        ]} />
    </>
  );
}
