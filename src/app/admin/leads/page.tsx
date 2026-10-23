import type { LeadStatus } from "@prisma/client";
import { adminPage } from "@/server/page-auth";
import { prisma } from "@/server/db";
import { getDictionary } from "@/lib/i18n/server";
import { serialize } from "@/lib/money";
import { PageHeader } from "@/components/ui/misc";
import { NativeSelect } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/shared/data-table";

export const metadata = { title: "Antrean aplikasi" };
const ALL: LeadStatus[] = ["LEAD", "CONTACTED", "APPLICATION_SUBMITTED", "UNDER_REVIEW", "REVISION_REQUESTED", "APPROVED", "REJECTED", "CANCELLED"];

export default async function LeadQueue({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await adminPage("merchant.view");
  const { t, locale } = await getDictionary();
  const sp = await searchParams;
  const statuses: LeadStatus[] = sp.status === "all" ? ALL : ALL.includes(sp.status as LeadStatus) ? [sp.status as LeadStatus] : ["APPLICATION_SUBMITTED", "UNDER_REVIEW"];
  const leads = await prisma.merchantLead.findMany({ where: { status: { in: statuses }, deletedAt: null }, include: { agent: { select: { fullName: true, agentCode: true } }, product: { select: { name: true } }, _count: { select: { documents: true } } }, orderBy: [{ submittedAt: "asc" }, { createdAt: "desc" }], take: 2000 });
  const rows = leads.map((l) => ({ id: l.id, name: l.businessName, owner: l.ownerName, agent: l.agent.fullName, agentCode: l.agent.agentCode, product: l.product.name, city: `${l.city}, ${l.province}`, status: l.status, docs: l._count.documents, submittedAt: l.submittedAt }));
  return (
    <>
      <PageHeader title={t.nav.leads} description="Aplikasi merchant yang menunggu peninjauan (terlama di atas)." />
      <form className="mb-4 flex items-end gap-2">
        <label className="grid gap-1 text-xs font-semibold">{t.common.status}
          <NativeSelect name="status" defaultValue={sp.status ?? ""} className="w-60"><option value="">Menunggu tinjauan</option><option value="all">{t.common.all}</option>{ALL.map((s) => <option key={s} value={s}>{t.status[s]}</option>)}</NativeSelect>
        </label>
        <Button type="submit" variant="outline">{t.common.apply}</Button>
      </form>
      <DataTable rows={serialize(rows)} locale={locale} statusLabels={t.status as unknown as Record<string, string>} emptyTitle="Antrean kosong" emptyBody="Tidak ada aplikasi yang menunggu peninjauan."
        columns={[
          { key: "name", header: "Merchant", type: "link", href: "/admin/leads/{id}", sub: "owner" }, { key: "agent", header: "Agen", sub: "agentCode" }, { key: "product", header: "Produk" },
          { key: "city", header: "Wilayah" }, { key: "docs", header: "Dokumen", type: "number", align: "right" }, { key: "status", header: "Status", type: "status" }, { key: "submittedAt", header: "Diajukan", type: "datetime" },
        ]} />
    </>
  );
}
