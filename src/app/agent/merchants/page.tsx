import Link from "next/link";
import { Plus } from "lucide-react";
import { pageContext } from "@/server/page-auth";
import { prisma } from "@/server/db";
import { getDictionary } from "@/lib/i18n/server";
import { serialize } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/misc";
import { DataTable } from "@/components/shared/data-table";
import { effectiveStage } from "@/components/shared/stage-timeline";

export const metadata = { title: "Merchant saya" };

export default async function AgentMerchants({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { actor } = await pageContext("agent");
  const { t, locale } = await getDictionary();
  const { q } = await searchParams;
  const leads = await prisma.merchantLead.findMany({
    where: {
      agentId: actor.agentId!, deletedAt: null,
      ...(q ? { OR: [{ businessName: { contains: q, mode: "insensitive" } }, { ownerName: { contains: q, mode: "insensitive" } }, { merchant: { merchantCode: { contains: q, mode: "insensitive" } } }] } : {}),
    },
    include: { product: { select: { name: true } }, merchant: { select: { merchantCode: true, status: true, _count: { select: { transactions: true } } } } },
    orderBy: { createdAt: "desc" },
  });
  const rows = leads.map((l) => ({
    id: l.id, businessName: l.businessName, owner: l.ownerName, city: l.city, product: l.product.name, merchantCode: l.merchant?.merchantCode ?? "—",
    stage: effectiveStage(l.status, l.merchant?.status), txns: l.merchant?._count.transactions ?? 0, createdAt: l.createdAt,
  }));
  return (
    <>
      <PageHeader
        title={t.nav.merchants}
        description="Merchant yang Anda daftarkan dan statusnya. Hanya Anda dan tim Hausjo yang dapat melihat data ini."
        actions={<Button asChild><Link href="/agent/merchants/new"><Plus />{t.agent.onboardMerchant}</Link></Button>}
      />
      <DataTable
        rows={serialize(rows)}
        locale={locale}
        statusLabels={t.status as unknown as Record<string, string>}
        searchPlaceholder={t.common.search}
        emptyTitle="Belum ada merchant"
        emptyBody="Daftarkan merchant pertama Anda — komisi dihitung setelah perangkat aktif."
        columns={[
          { key: "businessName", header: "Merchant", type: "link", href: "/agent/merchants/{id}", sub: "owner" },
          { key: "merchantCode", header: "ID merchant", type: "mono" },
          { key: "product", header: "Produk" },
          { key: "city", header: "Kota" },
          { key: "stage", header: "Status", type: "status" },
          { key: "txns", header: "Transaksi", type: "number", align: "right" },
          { key: "createdAt", header: "Dibuat", type: "date" },
        ]}
      />
    </>
  );
}
