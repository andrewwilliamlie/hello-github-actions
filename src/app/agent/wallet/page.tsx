import Link from "next/link";
import { Download, Printer } from "lucide-react";
import { pageContext } from "@/server/page-auth";
import { prisma } from "@/server/db";
import { getSetting } from "@/server/settings";
import { getDictionary } from "@/lib/i18n/server";
import { formatRupiah, serialize } from "@/lib/money";
import { businessDateString } from "@/lib/time";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, Kpi, PageHeader } from "@/components/ui/misc";
import { DataTable } from "@/components/shared/data-table";
import { ActionButton } from "@/components/shared/action-button";
import { StatusBadge } from "@/components/ui/status-badge";
import { WithdrawForm } from "./withdraw-form";
import { cancelWithdrawalAction } from "../actions";

export const metadata = { title: "Dompet" };

export default async function WalletPage() {
  const { actor } = await pageContext("agent");
  const { t, locale } = await getDictionary();
  const agentId = actor.agentId!;
  const [wallet, agent, bank, withdrawals, min] = await Promise.all([
    prisma.wallet.findUniqueOrThrow({ where: { agentId } }),
    prisma.agent.findUniqueOrThrow({ where: { id: agentId } }),
    prisma.agentBankAccount.findFirst({ where: { agentId, status: { not: "ARCHIVED" } }, orderBy: { createdAt: "desc" } }),
    prisma.withdrawalRequest.findMany({ where: { agentId }, include: { bankAccount: true }, orderBy: { requestedAt: "desc" } }),
    getSetting("withdrawal.minAmountIdr"),
  ]);
  const open = withdrawals.find((w) => ["REQUESTED", "APPROVED", "IN_BATCH", "PROCESSING", "FAILED"].includes(w.status));
  const disabledReason = agent.status !== "ACTIVE" ? "Penarikan tersedia setelah akun disetujui." : bank?.status !== "VERIFIED" ? "Rekening bank belum terverifikasi." : open ? "Masih ada penarikan yang sedang diproses." : wallet.payableBalance < BigInt(min) ? `Saldo dapat ditarik belum mencapai minimum ${formatRupiah(min)}.` : undefined;
  const month = businessDateString(new Date()).slice(0, 7);
  const rows = withdrawals.map((w) => ({ id: w.id, number: `WD-${w.withdrawalNumber}`, amount: w.amount, status: w.status, bank: `${w.bankAccount.bankName} ****${w.bankAccount.accountNumberLast4}`, requestedAt: w.requestedAt, paidAt: w.paidAt, note: w.rejectionReason ?? w.failureReason ?? "" }));
  return (
    <>
      <PageHeader
        title={t.nav.wallet}
        description="Saldo dihitung dari buku besar double-entry. Komisi Tertunda menjadi Dapat Ditarik setelah masa tinjauan selesai."
        actions={
          <>
            <Button asChild variant="outline"><a href={`/agent/wallet/statement?month=${month}`}><Download />{t.agent.statement}</a></Button>
            <Button asChild variant="outline"><Link href={`/agent/wallet/receipt?month=${month}`}><Printer />{t.agent.printStatement}</Link></Button>
          </>
        }
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi label={t.agent.pending} value={formatRupiah(wallet.pendingBalance)} />
        <Kpi highlight label={t.agent.payable} value={formatRupiah(wallet.payableBalance)} />
        <Kpi label={t.agent.reserved} value={formatRupiah(wallet.reservedBalance)} />
        <Kpi label={t.agent.paid} value={formatRupiah(wallet.paidTotal)} />
        <Kpi label={t.agent.receivable} value={formatRupiah(wallet.receivableBalance)} hint="Dipotong otomatis dari komisi berikutnya" />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_2fr]">
        <Card className="h-fit">
          <CardHeader>
            <CardTitle>{t.agent.withdraw}</CardTitle>
            <CardDescription>{bank ? <>Ke {bank.bankName} ****{bank.accountNumberLast4} a.n. {bank.accountHolderName} <StatusBadge status={bank.status} label={t.status[bank.status as keyof typeof t.status]} /></> : <Link href="/agent/onboarding" className="underline">Tambahkan rekening bank</Link>}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <WithdrawForm payable={wallet.payableBalance.toString()} min={String(min)} disabledReason={disabledReason} />
            {open?.status === "REQUESTED" && (
              <Alert variant="info" title={`WD-${open.withdrawalNumber} menunggu peninjauan`}>
                <div className="mt-2"><ActionButton action={cancelWithdrawalAction} args={{ withdrawalId: open.id }} label="Batalkan penarikan" variant="outline" confirmTitle="Batalkan penarikan ini?" /></div>
              </Alert>
            )}
            <p className="text-xs text-muted-foreground">Transfer dilakukan oleh tim Finance setelah persetujuan dua tahap (maker-checker). Status Dibayar hanya muncul setelah transfer dikonfirmasi dengan mutasi bank.</p>
          </CardContent>
        </Card>
        <div>
          <h2 className="mb-3 text-lg font-bold">Riwayat penarikan</h2>
          <DataTable rows={serialize(rows)} locale={locale} statusLabels={t.status as unknown as Record<string, string>} searchable={false} emptyTitle="Belum ada penarikan"
            columns={[
              { key: "number", header: "No.", type: "mono" }, { key: "amount", header: "Jumlah", type: "money", align: "right" }, { key: "status", header: "Status", type: "status" },
              { key: "bank", header: "Rekening" }, { key: "requestedAt", header: "Diajukan", type: "datetime" }, { key: "paidAt", header: "Dibayar", type: "datetime" }, { key: "note", header: "Catatan" },
            ]} />
        </div>
      </div>
    </>
  );
}
