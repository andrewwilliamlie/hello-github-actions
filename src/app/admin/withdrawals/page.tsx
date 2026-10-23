import { adminPage } from "@/server/page-auth";
import { prisma } from "@/server/db";
import { can } from "@/server/rbac";
import { getDictionary } from "@/lib/i18n/server";
import { formatRupiah, serialize } from "@/lib/money";
import { formatDateTime } from "@/lib/time";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { DataTable } from "@/components/shared/data-table";
import { ActionButton } from "@/components/shared/action-button";
import { BatchBuilder } from "./batch-builder";
import { reviewWithdrawalAction } from "../actions";

export const metadata = { title: "Penarikan" };

export default async function Withdrawals() {
  const { actor } = await adminPage("withdrawal.review");
  const { t, locale } = await getDictionary();
  const all = await prisma.withdrawalRequest.findMany({ include: { agent: { include: { wallet: true } }, bankAccount: true }, orderBy: { requestedAt: "desc" }, take: 2000 });
  const flagged = new Set((await prisma.fraudFlag.findMany({ where: { status: "OPEN", agentId: { in: all.map((w) => w.agentId) } }, select: { agentId: true } })).map((f) => f.agentId));
  const requested = all.filter((w) => w.status === "REQUESTED");
  const approved = all.filter((w) => w.status === "APPROVED" && !w.batchId);
  const L = t.status as unknown as Record<string, string>;
  return (
    <>
      <PageHeader title={t.nav.withdrawals} description="Tinjau permintaan penarikan, lalu kelompokkan ke dalam batch pembayaran (maker-checker)." />
      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Menunggu tinjauan ({requested.length})</CardTitle><CardDescription>Dana sudah dikunci dari saldo dapat ditarik agen.</CardDescription></CardHeader>
          <CardContent>
            {requested.length === 0 ? <EmptyState title="Tidak ada permintaan baru" /> : (
              <ul className="divide-y">
                {requested.map((w) => (
                  <li key={w.id} className="grid gap-2 py-3 text-sm">
                    <div className="flex flex-wrap items-baseline justify-between gap-2"><span><span className="font-mono">WD-{w.withdrawalNumber}</span> · <b>{w.agent.fullName}</b> ({w.agent.agentCode})</span><b className="text-base tabular">{formatRupiah(w.amount)}</b></div>
                    <div className="text-xs text-muted-foreground">{w.bankAccount.bankName} ****{w.bankAccount.accountNumberLast4} a.n. {w.bankAccount.accountHolderName} ({L[w.bankAccount.status]}) · {formatDateTime(w.requestedAt, locale)} · agen {L[w.agent.status]}</div>
                    {flagged.has(w.agentId) && <div className="text-xs font-semibold text-destructive">Agen memiliki tanda risiko terbuka — tinjau sebelum menyetujui.</div>}
                    {can(actor, "withdrawal.review") && (
                      <div className="flex gap-2">
                        <ActionButton action={reviewWithdrawalAction} args={{ withdrawalId: w.id, decision: "APPROVED" }} label="Setujui" variant="success" confirmTitle={`Setujui ${formatRupiah(w.amount)}?`} />
                        <ActionButton action={reviewWithdrawalAction} args={{ withdrawalId: w.id, decision: "REJECTED" }} label="Tolak" variant="outline" reason={{ label: "Alasan (dana dikembalikan ke saldo agen)", minLength: 5 }} />
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Disetujui — siap dibuat batch</CardTitle></CardHeader>
          <CardContent>{can(actor, "payout.create") ? <BatchBuilder items={approved.map((w) => ({ id: w.id, number: `WD-${w.withdrawalNumber}`, agent: w.agent.fullName, amount: w.amount.toString(), bank: `${w.bankAccount.bankName} ****${w.bankAccount.accountNumberLast4}` }))} /> : <p className="text-sm text-muted-foreground">Membutuhkan izin pembuatan batch.</p>}</CardContent>
        </Card>
      </div>
      <h2 className="mb-3 mt-8 text-lg font-bold">Semua penarikan</h2>
      <DataTable rows={serialize(all.map((w) => ({ number: `WD-${w.withdrawalNumber}`, agent: w.agent.fullName, code: w.agent.agentCode, amount: w.amount, status: w.status, batch: w.batchId ?? "", requestedAt: w.requestedAt, paidAt: w.paidAt, note: w.rejectionReason ?? w.failureReason ?? "" })))} locale={locale} statusLabels={L}
        columns={[{ key: "number", header: "No.", type: "mono" }, { key: "agent", header: "Agen", sub: "code" }, { key: "amount", header: "Jumlah", type: "money", align: "right" }, { key: "status", header: "Status", type: "status" }, { key: "batch", header: "Batch", type: "link", href: "/admin/payouts/{batch}" }, { key: "requestedAt", header: "Diajukan", type: "datetime" }, { key: "paidAt", header: "Dibayar", type: "datetime" }, { key: "note", header: "Catatan" }]} />
    </>
  );
}
