import { adminPage } from "@/server/page-auth";
import { prisma } from "@/server/db";
import { getDictionary } from "@/lib/i18n/server";
import { serialize } from "@/lib/money";
import { Kpi, PageHeader } from "@/components/ui/misc";
import { DataTable } from "@/components/shared/data-table";

export const metadata = { title: "Referral" };

export default async function AdminReferrals() {
  await adminPage("agent.view");
  const { t, locale } = await getDictionary();
  const [links, earned] = await Promise.all([
    prisma.agentReferral.findMany({ include: { referrer: true, recruit: true }, orderBy: { createdAt: "desc" }, take: 3000 }),
    prisma.referralCommission.groupBy({ by: ["referralId"], where: { referralEvent: { status: { not: "REVERSED" } } }, _sum: { amount: true } }),
  ]);
  const byRef = new Map(earned.map((e) => [e.referralId, e._sum.amount ?? 0n]));
  const rows = links.map((l) => ({
    id: l.id, referrer: l.referrer.fullName, referrerId: l.referrerAgentId, referrerCode: l.referrer.agentCode, recruit: l.recruit.fullName, recruitId: l.recruitAgentId, recruitCode: l.recruit.agentCode,
    code: l.referralCodeUsed, status: l.endedAt ? "VOID" : l.status, earned: byRef.get(l.id) ?? 0n, createdAt: l.createdAt,
  }));
  const total = earned.reduce((s, e) => s + (e._sum.amount ?? 0n), 0n);
  return (
    <>
      <PageHeader title={t.nav.referrals} description="Hubungan referral langsung. Bagi hasil hanya satu level (rekrutan langsung) dan hanya dari komisi bersih yang memenuhi syarat." />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Hubungan referral" value={links.filter((l) => !l.endedAt).length} />
        <Kpi label="Disetujui" value={links.filter((l) => !l.endedAt && l.status === "APPROVED").length} />
        <Kpi label="Menunggu" value={links.filter((l) => !l.endedAt && l.status === "PENDING").length} />
        <Kpi highlight label="Total bagi hasil" value={`Rp${total.toLocaleString("id-ID")}`} />
      </div>
      <DataTable rows={serialize(rows)} locale={locale} statusLabels={t.status as unknown as Record<string, string>}
        columns={[
          { key: "referrer", header: "Referrer", type: "link", href: "/admin/agents/{referrerId}", sub: "referrerCode" },
          { key: "recruit", header: "Rekrutan", type: "link", href: "/admin/agents/{recruitId}", sub: "recruitCode" },
          { key: "code", header: "Kode dipakai", type: "mono" }, { key: "status", header: "Status", type: "status" },
          { key: "earned", header: "Bagi hasil", type: "money", align: "right" }, { key: "createdAt", header: "Sejak", type: "date" },
        ]} />
    </>
  );
}
