import Link from "next/link";
import { adminPage } from "@/server/page-auth";
import { prisma } from "@/server/db";
import { getDictionary } from "@/lib/i18n/server";
import { formatDateTime } from "@/lib/time";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { StatusBadge } from "@/components/ui/status-badge";
import { ActionButton } from "@/components/shared/action-button";
import { resolveFraudAction } from "../actions";

export const metadata = { title: "Risiko & fraud" };

export default async function Fraud() {
  await adminPage("fraud.manage");
  const { t, locale } = await getDictionary();
  const flags = await prisma.fraudFlag.findMany({ orderBy: [{ status: "asc" }, { createdAt: "desc" }], take: 500 });
  const L = t.status as unknown as Record<string, string>;
  return (
    <>
      <PageHeader title={t.nav.fraud} description="Tanda risiko otomatis (rekening bersama, NIK duplikat, kecepatan referral, dugaan referral diri). Tanda MEDIUM/HIGH yang terbuka menahan rilis komisi terkait." />
      <Card>
        <CardContent className="p-0">
          {flags.length === 0 ? <EmptyState title="Tidak ada tanda risiko" /> : (
            <ul className="divide-y">
              {flags.map((f) => (
                <li key={f.id} className="grid gap-2 p-4 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={f.status} label={L[f.status]} /><b>{f.type}</b>
                    <Badge variant={f.severity === "HIGH" ? "danger" : f.severity === "MEDIUM" ? "warning" : "muted"}>{f.severity}</Badge>
                    {f.agentId && <Link className="underline" href={`/admin/agents/${f.agentId}`}>agen</Link>}
                    {f.merchantId && <Link className="underline" href={`/admin/merchants/${f.merchantId}`}>merchant</Link>}
                    <span className="text-xs text-muted-foreground">{formatDateTime(f.createdAt, locale)}</span>
                  </div>
                  <code className="break-all rounded bg-muted px-2 py-1 text-xs">{JSON.stringify(f.details)}</code>
                  {f.resolution && <p className="text-muted-foreground">{f.resolution}</p>}
                  {f.status === "OPEN" && (
                    <div className="flex gap-2">
                      <ActionButton action={resolveFraudAction} args={{ flagId: f.id, outcome: "CLEARED" }} label="Bersihkan (bukan fraud)" variant="outline" reason={{ label: "Hasil investigasi", minLength: 5 }} />
                      <ActionButton action={resolveFraudAction} args={{ flagId: f.id, outcome: "CONFIRMED" }} label="Konfirmasi fraud" variant="destructive" reason={{ label: "Hasil investigasi & tindakan", minLength: 5 }} confirmBody="Konfirmasi tidak otomatis membatalkan komisi — batalkan komisi terkait dan tangguhkan agen bila perlu." />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}
