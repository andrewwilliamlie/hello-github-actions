import Link from "next/link";
import { adminPage } from "@/server/page-auth";
import { prisma } from "@/server/db";
import { getDictionary } from "@/lib/i18n/server";
import { formatDateTime } from "@/lib/time";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { StatusBadge } from "@/components/ui/status-badge";
import { ActionButton } from "@/components/shared/action-button";
import { resolveDisputeAction } from "../actions";

export const metadata = { title: "Sengketa" };

export default async function Disputes() {
  await adminPage("dispute.manage");
  const { t, locale } = await getDictionary();
  const disputes = await prisma.dispute.findMany({ orderBy: [{ status: "asc" }, { createdAt: "desc" }], take: 500 });
  const agents = new Map((await prisma.agent.findMany({ where: { id: { in: disputes.map((d) => d.agentId).filter(Boolean) as string[] } }, select: { id: true, fullName: true, agentCode: true } })).map((a) => [a.id, a]));
  const L = t.status as unknown as Record<string, string>;
  return (
    <>
      <PageHeader title={t.nav.disputes} description="Sengketa komisi dari agen atau tim. Komisi yang masih tertunda dibekukan selama sengketa terbuka." />
      <Card>
        <CardContent className="p-0">
          {disputes.length === 0 ? <EmptyState title="Tidak ada sengketa" /> : (
            <ul className="divide-y">
              {disputes.map((d) => {
                const a = d.agentId ? agents.get(d.agentId) : null;
                return (
                  <li key={d.id} className="grid gap-2 p-4 text-sm">
                    <div className="flex flex-wrap items-center gap-2"><StatusBadge status={d.status} label={L[d.status]} /><b>{d.type}</b>{a && <Link className="underline" href={`/admin/agents/${a.id}`}>{a.fullName} ({a.agentCode})</Link>}{d.commissionEventId && <Link className="underline" href={`/admin/commissions/${d.commissionEventId}`}>komisi</Link>}<span className="text-xs text-muted-foreground">{formatDateTime(d.createdAt, locale)}</span></div>
                    <p>{d.description}</p>
                    {d.resolution && <p className="text-muted-foreground">Penyelesaian: {d.resolution}</p>}
                    {d.status === "OPEN" && (
                      <div className="flex flex-wrap gap-2">
                        <ActionButton action={resolveDisputeAction} args={{ disputeId: d.id, outcome: "UPHOLD_COMMISSION" }} label="Komisi sah — lanjutkan" variant="success" reason={{ label: "Penjelasan", minLength: 5 }} />
                        <ActionButton action={resolveDisputeAction} args={{ disputeId: d.id, outcome: "REVERSE_COMMISSION" }} label="Batalkan komisi" variant="destructive" reason={{ label: "Penjelasan", minLength: 5 }} />
                        <ActionButton action={resolveDisputeAction} args={{ disputeId: d.id, outcome: "REJECT" }} label="Tolak sengketa" variant="outline" reason={{ label: "Penjelasan", minLength: 5 }} />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}
