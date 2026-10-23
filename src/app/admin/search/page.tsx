import Link from "next/link";
import { pageContext } from "@/server/page-auth";
import { prisma } from "@/server/db";
import { can } from "@/server/rbac";
import { getDictionary } from "@/lib/i18n/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { StatusBadge } from "@/components/ui/status-badge";

export const metadata = { title: "Pencarian" };

export default async function Search({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { actor } = await pageContext("admin");
  const { t } = await getDictionary();
  const q = (await searchParams).q?.trim() ?? "";
  const L = t.status as unknown as Record<string, string>;
  const ci = { contains: q, mode: "insensitive" as const };
  const [agents, merchants, txns] = q.length < 2 ? [[], [], []] : await Promise.all([
    can(actor, "agent.view") ? prisma.agent.findMany({ where: { OR: [{ fullName: ci }, { agentCode: ci }, { referralCode: ci }, { email: ci }, { city: ci }] }, take: 20 }) : [],
    can(actor, "merchant.view") ? prisma.merchant.findMany({ where: { OR: [{ businessName: ci }, { merchantCode: ci }, { ownerName: ci }, { city: ci }] }, take: 20 }) : [],
    can(actor, "transaction.view") ? prisma.transaction.findMany({ where: { OR: [{ externalId: ci }, { terminalId: ci }, { settlementRef: ci }] }, take: 20 }) : [],
  ]);
  const none = agents.length + merchants.length + txns.length === 0;
  return (
    <>
      <PageHeader title={`${t.common.search}: “${q}”`} />
      {q.length < 2 ? <EmptyState title="Ketik minimal 2 karakter" /> : none ? <EmptyState title={t.common.noResults} /> : (
        <div className="grid gap-6 xl:grid-cols-3">
          <Card><CardHeader><CardTitle>{t.nav.agents} ({agents.length})</CardTitle></CardHeader><CardContent><ul className="space-y-2 text-sm">{agents.map((a) => <li key={a.id}><Link className="font-semibold hover:underline" href={`/admin/agents/${a.id}`}>{a.fullName}</Link> <span className="font-mono text-xs">{a.agentCode}</span> <StatusBadge status={a.status} label={L[a.status]} /></li>)}</ul></CardContent></Card>
          <Card><CardHeader><CardTitle>{t.nav.merchants} ({merchants.length})</CardTitle></CardHeader><CardContent><ul className="space-y-2 text-sm">{merchants.map((m) => <li key={m.id}><Link className="font-semibold hover:underline" href={`/admin/merchants/${m.id}`}>{m.businessName}</Link> <span className="font-mono text-xs">{m.merchantCode}</span></li>)}</ul></CardContent></Card>
          <Card><CardHeader><CardTitle>{t.nav.transactions} ({txns.length})</CardTitle></CardHeader><CardContent><ul className="space-y-2 text-sm">{txns.map((x) => <li key={x.id} className="font-mono text-xs">{x.source}:{x.externalId} · {x.terminalId} <StatusBadge status={x.rewardStatus} label={L[x.rewardStatus]} /></li>)}</ul></CardContent></Card>
        </div>
      )}
    </>
  );
}
