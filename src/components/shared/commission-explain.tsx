import Link from "next/link";
import type { Dictionary } from "@/lib/i18n/id";
import { formatBps, formatRupiah } from "@/lib/money";
import { formatBusinessDate, formatDateTime } from "@/lib/time";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { DescriptionList, Alert } from "@/components/ui/misc";
import { StatusBadge } from "@/components/ui/status-badge";
import { Badge } from "@/components/ui/badge";
import type { explainCommission } from "@/server/modules/commissions";

type Data = Awaited<ReturnType<typeof explainCommission>>;

const ACCOUNT: Record<string, string> = {
  AGENT_PENDING: "Saldo tertunda agen", AGENT_PAYABLE: "Saldo dapat ditarik", AGENT_RESERVED: "Dana dalam penarikan", AGENT_RECEIVABLE: "Piutang clawback",
  COMMISSION_EXPENSE: "Beban komisi (perusahaan)", PAYOUT_CLEARING: "Kliring pembayaran (perusahaan)",
};

/** Explainable commission: source, rate, beneficiary, rule version, calculation and ledger trail. */
export function CommissionExplain({ data, t, locale, admin }: { data: Data; t: Dictionary; locale: string; admin?: boolean }) {
  const { event: e, order, transaction, merchant } = data;
  const calc = e.calculation as { formula: string; inputs: Record<string, string | number>; rule: { code: string; version: number; name: string; isDemo: boolean }; capped: boolean; result: string };
  const snap = e.ruleSnapshot as Record<string, unknown>;
  const labels = t.status as unknown as Record<string, string>;
  const ref = e.referralAsPaid;
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">{t.commissionType[e.type]} <StatusBadge status={e.status} label={labels[e.status]} />{e.isDemo && <Badge variant="demo">Demo</Badge>}</CardTitle>
          <CardDescription className="font-mono">{e.eventRef}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5">
          <div className="rounded-xl bg-navy-900 p-4 text-white">
            <div className="text-xs font-bold uppercase tracking-wider text-sky-200">{t.common.amount}</div>
            <div className="text-3xl font-extrabold tabular">{formatRupiah(e.amount - e.deductedAmount)}</div>
            {e.deductedAmount > 0n && <div className="text-xs text-sky-100/80">Bruto {formatRupiah(e.amount)} − potongan referral {formatRupiah(e.deductedAmount)}</div>}
          </div>
          <DescriptionList items={[
            { label: t.agent.beneficiary, value: admin ? <Link className="underline" href={`/admin/agents/${e.agent.id}`}>{e.agent.fullName} ({e.agent.agentCode})</Link> : `${e.agent.fullName} (${e.agent.agentCode})` },
            { label: "Tanggal bisnis", value: formatBusinessDate(e.businessDate, locale) },
            { label: "Terjadi", value: formatDateTime(e.occurredAt, locale) },
            { label: "Masa tinjauan s.d.", value: formatDateTime(e.holdUntil, locale) },
            { label: "Memenuhi syarat", value: formatDateTime(e.eligibleAt, locale) },
            { label: "Dapat ditarik", value: formatDateTime(e.payableAt, locale) },
            { label: "Dibayar", value: formatDateTime(e.paidAt, locale) },
            ...(e.reversedAt ? [{ label: "Dibatalkan", value: `${formatDateTime(e.reversedAt, locale)} — ${e.reversalReason}` }] : []),
          ]} />
          {e.status === "DISPUTED" && <Alert variant="warning" title="Disengketakan">{e.disputeReason}</Alert>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>{t.agent.explain}</CardTitle><CardDescription>Aturan disalin ke komisi saat dibuat — perubahan aturan di masa depan tidak mengubah komisi ini.</CardDescription></CardHeader>
        <CardContent className="grid gap-4">
          <DescriptionList items={[
            { label: t.agent.rule, value: <>{calc.rule.name} {calc.rule.isDemo && <Badge variant="demo">Demo</Badge>}</> },
            { label: t.agent.ruleVersion, value: <span className="font-mono">{calc.rule.code} v{calc.rule.version}</span> },
            { label: "Nominal/tarif aturan", value: snap.fixedAmount ? formatRupiah(String(snap.fixedAmount)) : snap.rateBps !== null && snap.rateBps !== undefined ? formatBps(Number(snap.rateBps)) : "—" },
            { label: "Masa tinjauan", value: `${snap.holdDays} hari` },
            { label: "Persetujuan manual", value: snap.requiresManualApproval ? "Ya" : "Tidak" },
            { label: "Batas (cap)", value: snap.capAmount ? formatRupiah(String(snap.capAmount)) : "—" },
          ]} />
          <div className="rounded-lg border bg-muted/40 p-3">
            <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t.agent.formula}</div>
            <div className="mt-1 font-mono text-sm">{calc.formula} = {formatRupiah(calc.result)}</div>
            <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
              {Object.entries(calc.inputs).map(([k, v]) => <li key={k}><span className="font-semibold">{k}</span>: <span className="font-mono">{String(v)}</span></li>)}
            </ul>
          </div>
          <div className="text-sm">
            <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t.agent.sourceTx}</div>
            {order && <p className="mt-1">Pesanan ORD-{order.orderNumber} · {order.product.name} ({order.product.sku}) · {formatRupiah(order.totalAmount)}</p>}
            {transaction && <p className="mt-1 font-mono text-xs">{transaction.source}:{transaction.externalId} · TID {transaction.terminalId} · {transaction.type} · {formatRupiah(transaction.amount)} · settlement {transaction.settlementRef ?? "—"}</p>}
            {merchant && <p className="mt-1">Merchant {merchant.businessName} ({merchant.merchantCode})</p>}
            {ref && <p className="mt-1">Bagi hasil dari komisi rekrutan langsung <span className="font-mono">{ref.baseEvent.eventRef}</span>: {formatRupiah(ref.baseAmount)} × {formatBps(ref.rateBps)}</p>}
          </div>
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader><CardTitle>Jejak buku besar</CardTitle><CardDescription>Entri double-entry yang tidak dapat diubah.</CardDescription></CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm tabular">
            <thead><tr className="border-b text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground"><th className="py-2">Waktu</th><th>Jurnal</th><th>Akun</th><th className="text-right">Debit</th><th className="text-right">Kredit</th></tr></thead>
            <tbody>
              {e.ledgerEntries.map((l) => (
                <tr key={l.id} className="border-b last:border-0">
                  <td className="whitespace-nowrap py-2">{formatDateTime(l.createdAt, locale)}</td>
                  <td><span className="font-mono text-xs">{l.journal.kind}</span><div className="text-xs text-muted-foreground">{l.journal.description}</div></td>
                  <td>{ACCOUNT[l.account]}</td>
                  <td className="text-right">{l.direction === "DEBIT" ? formatRupiah(l.amount) : ""}</td>
                  <td className="text-right">{l.direction === "CREDIT" ? formatRupiah(l.amount) : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
