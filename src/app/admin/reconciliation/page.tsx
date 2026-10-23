import Link from "next/link";
import { adminPage } from "@/server/page-auth";
import { prisma } from "@/server/db";
import { getDictionary } from "@/lib/i18n/server";
import { formatRupiah } from "@/lib/money";
import { businessDateString, formatBusinessDate, formatDateTime, addDays } from "@/lib/time";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { StatusBadge } from "@/components/ui/status-badge";
import { ActionForm } from "@/components/shared/action-form";
import { ActionButton } from "@/components/shared/action-button";
import { resolveExceptionAction, runReconAction } from "../actions";

export const metadata = { title: "Rekonsiliasi" };

const EXPLAIN: Record<string, string> = {
  UNMATCHED_TERMINAL: "Terminal ID tidak cocok dengan perangkat aktif. Aktifkan perangkat dengan TID ini atau abaikan bila data prosesor salah.",
  SETTLEMENT_MISMATCH: "Jumlah/nominal transaksi berhasil tidak sama dengan laporan settlement. Imbalan ditahan sampai cocok atau diterima dengan pengecualian.",
  MISSING_SETTLEMENT: "Transaksi berhasil tanpa laporan settlement. Imbalan menunggu laporan.",
  STATUS_CONFLICT: "Prosesor mengirim ulang transaksi dengan data/status yang bertentangan. Data lama dipertahankan.",
  NO_ATTRIBUTION: "Merchant tidak memiliki atribusi agen pada waktu transaksi.",
  DEVICE_NOT_ACTIVE: "Perangkat tidak aktif pada waktu transaksi.",
};

export default async function Reconciliation() {
  await adminPage("reconciliation.manage");
  const { t, locale } = await getDictionary();
  const [exceptions, runs, settlements] = await Promise.all([
    prisma.reconciliationException.findMany({ where: { status: "OPEN" }, orderBy: { createdAt: "desc" }, take: 500 }),
    prisma.reconciliationRun.findMany({ orderBy: { startedAt: "desc" }, take: 15 }),
    prisma.settlement.findMany({ orderBy: { settlementDate: "desc" }, take: 60 }),
  ]);
  const L = t.status as unknown as Record<string, string>;
  return (
    <>
      <PageHeader title={t.nav.reconciliation} description="Rekonsiliasi harian (otomatis 02:00 WIB untuk hari sebelumnya) mencocokkan laporan settlement dengan transaksi, lalu mengevaluasi imbalan transaksi." />
      <div className="grid gap-6 xl:grid-cols-[1fr_2fr]">
        <Card className="h-fit">
          <CardHeader><CardTitle>Jalankan rekonsiliasi</CardTitle><CardDescription>Aman dijalankan berulang (idempoten).</CardDescription></CardHeader>
          <CardContent>
            <ActionForm action={runReconAction} submitLabel="Jalankan" resetOnSuccess={false}>
              <Field label="Tanggal bisnis s.d." htmlFor="date"><Input id="date" name="date" type="date" defaultValue={businessDateString(addDays(new Date(), -1))} required /></Field>
            </ActionForm>
            <h3 className="mb-2 mt-6 text-sm font-bold">Run terakhir</h3>
            <ul className="space-y-2 text-xs">
              {runs.map((r) => (
                <li key={r.id} className="rounded-lg border p-2">
                  <div className="flex items-center justify-between gap-2"><span>{formatBusinessDate(r.businessDate, locale)} · {formatDateTime(r.startedAt, locale)}</span><StatusBadge status={r.status} label={L[r.status]} /></div>
                  <div className="mt-1 font-mono text-[11px] text-muted-foreground">{Object.entries(r.stats as Record<string, number>).map(([k, v]) => `${k}=${v}`).join(" · ")}</div>
                  {r.error && <div className="text-destructive">{r.error}</div>}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <div className="grid gap-6">
          <Card>
            <CardHeader><CardTitle>Antrean pengecualian ({exceptions.length})</CardTitle></CardHeader>
            <CardContent>
              {exceptions.length === 0 ? <EmptyState title="Tidak ada pengecualian terbuka" /> : (
                <ul className="divide-y">
                  {exceptions.map((e) => (
                    <li key={e.id} className="grid gap-2 py-3 text-sm">
                      <div className="flex flex-wrap items-center gap-2"><StatusBadge status="OPEN" label={e.type} /><span className="text-xs text-muted-foreground">{formatDateTime(e.createdAt, locale)}</span></div>
                      <p className="text-muted-foreground">{EXPLAIN[e.type]}</p>
                      <code className="break-all rounded bg-muted px-2 py-1 text-xs">{JSON.stringify(e.details)}</code>
                      <div className="flex flex-wrap gap-2">
                        {e.type === "SETTLEMENT_MISMATCH" && <ActionButton action={resolveExceptionAction} args={{ exceptionId: e.id, action: "accept_settlement" }} label="Terima dengan pengecualian" variant="outline" reason={{ label: "Dasar keputusan (mis. konfirmasi prosesor)", minLength: 5 }} confirmBody="Transaksi berhasil pada settlement ini dianggap settle dan dievaluasi untuk imbalan." />}
                        {e.transactionId && <ActionButton action={resolveExceptionAction} args={{ exceptionId: e.id, action: "retry" }} label="Coba cocokkan ulang" variant="outline" reason={{ label: "Catatan", minLength: 5 }} />}
                        <ActionButton action={resolveExceptionAction} args={{ exceptionId: e.id, action: "ignore" }} label="Abaikan" variant="ghost" reason={{ label: "Alasan", minLength: 5 }} />
                        {e.transactionId && <Link className="text-xs underline" href={`/admin/transactions?match=UNMATCHED`}>transaksi</Link>}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Laporan settlement</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm tabular">
                <thead><tr className="border-b text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground"><th className="py-2">Referensi</th><th>Tanggal</th><th className="text-right">Diharapkan</th><th className="text-right">Cocok</th><th>Status</th></tr></thead>
                <tbody>
                  {settlements.map((s) => (
                    <tr key={s.id} className="border-b last:border-0"><td className="py-2 font-mono text-xs">{s.source}:{s.settlementRef}</td><td>{formatBusinessDate(s.settlementDate, locale)}</td><td className="text-right">{s.expectedCount} · {formatRupiah(s.expectedAmount)}</td><td className="text-right">{s.matchedCount} · {formatRupiah(s.matchedAmount)}</td><td><StatusBadge status={s.status} label={L[s.status]} /></td></tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
