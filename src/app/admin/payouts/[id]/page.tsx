import Link from "next/link";
import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import { adminPage } from "@/server/page-auth";
import { prisma } from "@/server/db";
import { can } from "@/server/rbac";
import { getDictionary } from "@/lib/i18n/server";
import { formatRupiah } from "@/lib/money";
import { formatDateTime } from "@/lib/time";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, Kpi, PageHeader } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { ActionButton } from "@/components/shared/action-button";
import { ActionForm } from "@/components/shared/action-form";
import { approveBatchAction, cancelBatchAction, confirmTransferAction, failTransferAction, recordTransferAction, retryPayoutAction, returnFundsAction } from "../../actions";

export const metadata = { title: "Batch pembayaran" };

export default async function PayoutBatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { actor } = await adminPage("payout.create");
  const { t, locale } = await getDictionary();
  const { id } = await params;
  const b = await prisma.payoutBatch.findUnique({ where: { id }, include: { withdrawals: { include: { agent: true, bankAccount: true, attempts: { orderBy: { attemptNumber: "asc" } } } } } });
  if (!b) notFound();
  const userIds = [b.createdById, b.approvedById, ...b.withdrawals.flatMap((w) => w.attempts.flatMap((a) => [a.recordedById, a.confirmedById]))].filter(Boolean) as string[];
  const users = new Map((await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  const L = t.status as unknown as Record<string, string>;
  const me = actor.userId;
  return (
    <>
      <PageHeader
        eyebrow={<Link href="/admin/payouts" className="hover:underline">← {t.nav.payouts}</Link>}
        title={`BATCH-${b.batchNumber}`}
        description={<span className="flex flex-wrap items-center gap-2"><StatusBadge status={b.status} label={L[b.status]} /> maker {users.get(b.createdById)} · checker {b.approvedById ? users.get(b.approvedById) : "—"}</span>}
        actions={
          <>
            {b.status === "PENDING_APPROVAL" && can(actor, "payout.approve") && (b.createdById === me ? <Alert variant="info">Anda adalah maker batch ini — persetujuan harus dari pengguna lain.</Alert> : <ActionButton action={approveBatchAction} args={{ batchId: b.id }} label="Setujui batch (checker)" variant="success" size="default" confirmTitle={`Setujui pembayaran ${formatRupiah(b.totalAmount)}?`} />)}
            {b.status === "PENDING_APPROVAL" && <ActionButton action={cancelBatchAction} args={{ batchId: b.id }} label="Batalkan batch" variant="outline" size="default" reason={{ label: "Alasan", minLength: 5 }} />}
            {["APPROVED", "PROCESSING", "PARTIALLY_FAILED"].includes(b.status) && can(actor, "payout.export") && <Button asChild variant="outline"><a href={`/admin/payouts/${b.id}/instructions`}><Download />Instruksi transfer (CSV)</a></Button>}
          </>
        }
      />
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi highlight label="Total" value={formatRupiah(b.totalAmount)} /><Kpi label="Item" value={b.itemCount} />
        <Kpi label="Dibayar" value={b.withdrawals.filter((w) => w.status === "PAID").length} /><Kpi label="Gagal" value={b.withdrawals.filter((w) => w.status === "FAILED").length} />
      </div>
      <div className="grid gap-4">
        {b.withdrawals.map((w) => {
          const live = w.attempts.find((a) => a.status === "PENDING" || a.status === "SUBMITTED");
          return (
            <Card key={w.id}>
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2"><span className="font-mono">WD-{w.withdrawalNumber}</span> {w.agent.fullName} · {formatRupiah(w.amount)} <StatusBadge status={w.status} label={L[w.status]} /></CardTitle>
                <CardDescription>{w.bankAccount.bankName} ****{w.bankAccount.accountNumberLast4} a.n. {w.bankAccount.accountHolderName}</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4">
                <ol className="space-y-1 text-sm">
                  {w.attempts.map((a) => (
                    <li key={a.id} className="flex flex-wrap items-center gap-2">
                      Percobaan #{a.attemptNumber} <StatusBadge status={a.status} label={L[a.status]} />
                      {a.providerReference && <span className="font-mono text-xs">ref {a.providerReference}</span>}
                      {a.recordedById && <span className="text-xs text-muted-foreground">dicatat {users.get(a.recordedById)} {formatDateTime(a.recordedAt, locale)}</span>}
                      {a.confirmedById && <span className="text-xs text-muted-foreground">dikonfirmasi {users.get(a.confirmedById)} {formatDateTime(a.confirmedAt, locale)}</span>}
                      {a.proofFileId && <a className="text-xs underline" target="_blank" href={`/api/files/${a.proofFileId}`}>bukti</a>}
                      {a.failureReason && <span className="text-xs text-destructive">{a.failureReason}</span>}
                    </li>
                  ))}
                </ol>
                {live?.status === "PENDING" && can(actor, "payout.record") && (
                  <ActionForm action={recordTransferAction} hidden={{ attemptId: live.id }} submitLabel="Catat transfer telah dilakukan" variant="secondary">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label="Nomor referensi bank" htmlFor={`ref-${live.id}`}><Input id={`ref-${live.id}`} name="providerReference" required className="font-mono" /></Field>
                      <Field label="Bukti transfer (PDF/gambar)" htmlFor={`proof-${live.id}`}><Input id={`proof-${live.id}`} name="proof" type="file" accept="application/pdf,image/png,image/jpeg,image/webp" /></Field>
                    </div>
                  </ActionForm>
                )}
                {live?.status === "SUBMITTED" && (
                  <div className="flex flex-wrap items-center gap-2">
                    {can(actor, "payout.confirm") && (live.recordedById === me ? <span className="text-sm text-muted-foreground">Konfirmasi harus oleh pengguna lain (Anda mencatat transfer ini).</span> : <ActionButton action={confirmTransferAction} args={{ attemptId: live.id }} label="Konfirmasi dengan mutasi bank" variant="success" confirmTitle="Dana terlihat keluar di mutasi rekening Hausjo dengan referensi ini?" />)}
                  </div>
                )}
                {live && can(actor, "payout.record") && <div><ActionButton action={failTransferAction} args={{ attemptId: live.id }} label="Tandai gagal" variant="outline" reason={{ label: "Alasan (mis. rekening tidak valid, retur bank)", minLength: 5 }} /></div>}
                {w.status === "FAILED" && can(actor, "payout.record") && (
                  <div className="flex flex-wrap gap-2">
                    <ActionButton action={retryPayoutAction} args={{ withdrawalId: w.id }} label="Coba lagi (percobaan baru)" variant="secondary" />
                    <ActionButton action={returnFundsAction} args={{ withdrawalId: w.id }} label="Kembalikan dana ke agen" variant="outline" reason={{ label: "Alasan", minLength: 5 }} />
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </>
  );
}
