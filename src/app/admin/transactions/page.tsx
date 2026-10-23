import type { Prisma, TxnRewardStatus, TxnStatus } from "@prisma/client";
import { adminPage } from "@/server/page-auth";
import { prisma } from "@/server/db";
import { can } from "@/server/rbac";
import { getDictionary } from "@/lib/i18n/server";
import { serialize } from "@/lib/money";
import { parseRange } from "@/lib/range";
import { parseDateOnly } from "@/lib/time";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Kpi, PageHeader } from "@/components/ui/misc";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/shared/data-table";
import { ActionForm } from "@/components/shared/action-form";
import { ingestManualAction } from "../actions";

export const metadata = { title: "Transaksi" };
const RS: TxnRewardStatus[] = ["NOT_EVALUATED", "AWAITING_SETTLEMENT", "REWARDED", "INELIGIBLE", "REVERSED"];
const ST: TxnStatus[] = ["SUCCESS", "FAILED", "PENDING", "REVERSED"];

export default async function AdminTransactions({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { actor } = await adminPage("transaction.view");
  const { t, locale } = await getDictionary();
  const sp = await searchParams;
  const range = parseRange(sp, 7);
  const where: Prisma.TransactionWhereInput = {
    businessDate: { gte: parseDateOnly(range.from), lte: parseDateOnly(range.to) },
    ...(RS.includes(sp.reward as TxnRewardStatus) ? { rewardStatus: sp.reward as TxnRewardStatus } : {}),
    ...(ST.includes(sp.status as TxnStatus) ? { status: sp.status as TxnStatus } : {}),
    ...(sp.match === "UNMATCHED" ? { matchStatus: "UNMATCHED" } : {}),
  };
  const [txns, byReward] = await Promise.all([
    prisma.transaction.findMany({ where, include: { merchant: { select: { businessName: true, merchantCode: true } } }, orderBy: { occurredAt: "desc" }, take: 5000 }),
    prisma.transaction.groupBy({ by: ["rewardStatus"], where, _count: true }),
  ]);
  const L = t.status as unknown as Record<string, string>;
  const rows = txns.map((x) => ({ id: x.id, ref: x.externalId, source: x.source, tid: x.terminalId, merchant: x.merchant ? x.merchant.businessName : "—", merchantCode: x.merchant?.merchantCode ?? "", type: x.type, status: x.status, amount: x.amount, match: x.matchStatus, reward: x.rewardStatus, reason: x.ineligibleReason ?? "", settlement: x.settlementRef ?? "—", at: x.occurredAt, channel: x.ingestChannel }));
  return (
    <>
      <PageHeader title={t.nav.transactions} description="Transaksi ternormalisasi dari API, webhook, dan impor. Kunci idempoten: sumber + ID transaksi." />
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-5">{RS.map((s) => <Kpi key={s} label={L[s]} value={(byReward.find((x) => x.rewardStatus === s)?._count ?? 0).toLocaleString("id-ID")} />)}</div>
      <form className="mb-4 grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-3 lg:grid-cols-6">
        <label className="grid gap-1 text-xs font-semibold">{t.common.from}<Input type="date" name="from" defaultValue={range.from} /></label>
        <label className="grid gap-1 text-xs font-semibold">{t.common.to}<Input type="date" name="to" defaultValue={range.to} /></label>
        <label className="grid gap-1 text-xs font-semibold">Status<NativeSelect name="status" defaultValue={sp.status ?? ""}><option value="">{t.common.all}</option>{ST.map((s) => <option key={s} value={s}>{L[s]}</option>)}</NativeSelect></label>
        <label className="grid gap-1 text-xs font-semibold">Imbalan<NativeSelect name="reward" defaultValue={sp.reward ?? ""}><option value="">{t.common.all}</option>{RS.map((s) => <option key={s} value={s}>{L[s]}</option>)}</NativeSelect></label>
        <label className="grid gap-1 text-xs font-semibold">Pencocokan<NativeSelect name="match" defaultValue={sp.match ?? ""}><option value="">{t.common.all}</option><option value="UNMATCHED">{L.UNMATCHED}</option></NativeSelect></label>
        <div className="flex items-end"><Button type="submit" className="w-full">{t.common.apply}</Button></div>
      </form>
      <DataTable rows={serialize(rows)} locale={locale} statusLabels={L} pageSize={25}
        columns={[
          { key: "ref", header: "ID transaksi", type: "mono", sub: "source" }, { key: "tid", header: "TID", type: "mono" }, { key: "merchant", header: "Merchant", sub: "merchantCode" }, { key: "type", header: "Jenis" },
          { key: "status", header: "Status", type: "status" }, { key: "amount", header: "Nominal", type: "money", align: "right" }, { key: "settlement", header: "Settlement", type: "mono" },
          { key: "reward", header: "Imbalan", type: "status", sub: "reason" }, { key: "at", header: "Waktu", type: "datetime" }, { key: "channel", header: "Kanal" },
        ]} />
      {can(actor, "transaction.ingest") && (
        <Card className="mt-8">
          <CardHeader><CardTitle>Input manual (JSON)</CardTitle><CardDescription>Untuk pengujian atau koreksi. Format sama dengan API: externalId, terminalId, status, amount, occurredAt, settlementRef, type, isTest. Pengiriman ulang bersifat idempoten.</CardDescription></CardHeader>
          <CardContent>
            <ActionForm action={ingestManualAction} submitLabel="Proses transaksi">
              <Field label="Kode sumber/prosesor" htmlFor="source"><Input id="source" name="source" required className="max-w-xs font-mono uppercase" defaultValue="MANUAL" /></Field>
              <Field label="Payload" htmlFor="payload"><Textarea id="payload" name="payload" rows={6} className="font-mono text-xs" required defaultValue={JSON.stringify([{ externalId: "TRX-001", terminalId: "TID00001", status: "SUCCESS", amount: 125000, occurredAt: new Date().toISOString(), settlementRef: "STL-001", type: "PURCHASE" }], null, 2)} /></Field>
            </ActionForm>
          </CardContent>
        </Card>
      )}
    </>
  );
}
