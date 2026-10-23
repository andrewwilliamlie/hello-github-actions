import Link from "next/link";
import { adminPage } from "@/server/page-auth";
import { prisma } from "@/server/db";
import { listRules } from "@/server/modules/rules";
import { getSetting } from "@/server/settings";
import { can } from "@/server/rbac";
import { getDictionary } from "@/lib/i18n/server";
import { formatBps, formatRupiah } from "@/lib/money";
import { formatDateTime } from "@/lib/time";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, PageHeader } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { ActionButton } from "@/components/shared/action-button";
import { RuleForm } from "./rule-form";
import { ruleDecideAction, ruleRetireAction, ruleSubmitAction } from "../actions";

export const metadata = { title: "Aturan komisi" };

const toLocalInput = (d: Date) => new Date(d.getTime() + 7 * 3600_000).toISOString().slice(0, 16);

export default async function Rules({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  const { actor } = await adminPage("rule.manage");
  const { t, locale } = await getDictionary();
  const sp = await searchParams;
  const [rules, products, min, max] = await Promise.all([listRules(), prisma.product.findMany({ where: { deletedAt: null }, select: { id: true, name: true, sku: true }, orderBy: { name: "asc" } }), getSetting("sales.commissionMinIdr"), getSetting("sales.commissionMaxIdr")]);
  const base = sp.from ? rules.find((r) => r.id === sp.from) : undefined;
  const c = (base?.conditions ?? {}) as Record<string, string[] | string>;
  const defaults = base ? {
    code: base.code, type: base.type, name: base.name, description: base.description ?? "", productId: base.productId ?? "", fixedAmount: base.fixedAmount?.toString() ?? "",
    ratePercent: base.rateBps !== null ? String(base.rateBps / 100) : "", capAmount: base.capAmount?.toString() ?? "", transactionTypes: (c.transactionTypes as string[] | undefined)?.join(", ") ?? "",
    sources: (c.sources as string[] | undefined)?.join(", ") ?? "", merchantIds: (c.merchantIds as string[] | undefined)?.join(", ") ?? "", excludeMerchantIds: (c.excludeMerchantIds as string[] | undefined)?.join(", ") ?? "",
    minTransactionAmount: (c.minTransactionAmount as string) ?? "", priority: String(base.priority), effectiveFrom: toLocalInput(new Date()), holdDays: String(base.holdDays),
    requiresManualApproval: String(base.requiresManualApproval), deductFromRecruit: String(base.deductFromRecruit),
  } : undefined;
  const L = t.status as unknown as Record<string, string>;
  const groups = [...new Set(rules.map((r) => r.type))];
  return (
    <>
      <PageHeader title={t.nav.rules} description="Mesin aturan berversi. Setiap komisi menyimpan salinan versi aturan yang dipakai; mengubah aturan tidak mengubah komisi historis. Aturan baru memerlukan persetujuan pengguna lain (maker-checker)." />
      {rules.some((r) => r.isDemo && r.status === "ACTIVE") && <div className="mb-4"><Alert variant="warning" title="Aturan DEMO aktif">Nilai komisi penjualan per SKU dan persentase referral pada data demo hanyalah contoh. Buat versi baru dengan nilai resmi dan setujui sebelum go-live.</Alert></div>}
      <div className="grid gap-6">
        {groups.map((g) => (
          <Card key={g}>
            <CardHeader><CardTitle>{t.commissionType[g]}</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm tabular">
                <thead><tr className="border-b text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground"><th className="py-2">Aturan</th><th>Nilai</th><th>Berlaku</th><th>Tinjauan</th><th>Status</th><th className="text-right">Tindakan</th></tr></thead>
                <tbody>
                  {rules.filter((r) => r.type === g).map((r) => (
                    <tr key={r.id} className="border-b last:border-0 align-top">
                      <td className="py-2"><div className="font-semibold">{r.name} {r.isDemo && <Badge variant="demo">Demo</Badge>}</div><div className="font-mono text-xs text-muted-foreground">{r.code} v{r.version}{r.product ? ` · ${r.product.sku}` : ""}</div></td>
                      <td>{r.fixedAmount !== null ? formatRupiah(r.fixedAmount) : r.rateBps !== null ? formatBps(r.rateBps) : "—"}{r.capAmount !== null && <div className="text-xs text-muted-foreground">cap {formatRupiah(r.capAmount)}</div>}{r.deductFromRecruit && <div className="text-xs">dipotong dari rekrutan</div>}</td>
                      <td className="text-xs">{formatDateTime(r.effectiveFrom, locale)}<br />→ {r.effectiveTo ? formatDateTime(r.effectiveTo, locale) : "tanpa batas"}</td>
                      <td>{r.holdDays} hari{r.requiresManualApproval && <div className="text-xs">+ persetujuan manual</div>}</td>
                      <td><StatusBadge status={r.status} label={L[r.status]} /></td>
                      <td className="text-right">
                        <div className="flex flex-wrap justify-end gap-1">
                          {r.status === "DRAFT" && <ActionButton action={ruleSubmitAction} args={{ ruleId: r.id }} label="Ajukan" variant="outline" />}
                          {r.status === "PENDING_APPROVAL" && can(actor, "rule.approve") && <>
                            <ActionButton action={ruleDecideAction} args={{ ruleId: r.id, decision: "approve" }} label="Setujui" variant="success" confirmTitle="Aktifkan aturan ini?" confirmBody="Versi aktif sebelumnya pada kode yang sama akan berakhir pada tanggal mulai aturan ini." />
                            <ActionButton action={ruleDecideAction} args={{ ruleId: r.id, decision: "reject" }} label="Tolak" variant="outline" />
                          </>}
                          {r.status === "ACTIVE" && can(actor, "rule.approve") && <ActionButton action={ruleRetireAction} args={{ ruleId: r.id }} label="Pensiunkan" variant="outline" confirmTitle="Pensiunkan aturan?" confirmBody="Transaksi baru tidak lagi mendapat komisi dari aturan ini." />}
                          <Button asChild size="sm" variant="ghost"><Link href={`/admin/rules?from=${r.id}#form`}>Versi baru</Link></Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        ))}
        <Card id="form">
          <CardHeader><CardTitle>{base ? `Versi baru untuk ${base.code}` : "Aturan baru"}</CardTitle><CardDescription>Disimpan sebagai draf, lalu diajukan dan disetujui oleh pengguna lain.</CardDescription></CardHeader>
          <CardContent><RuleForm key={base?.id ?? "new"} products={products} defaults={defaults ?? { effectiveFrom: toLocalInput(new Date()) }} range={{ min, max }} /></CardContent>
        </Card>
      </div>
    </>
  );
}
