import type { AgentStatus, Prisma } from "@prisma/client";
import { adminPage } from "@/server/page-auth";
import { prisma } from "@/server/db";
import { getDictionary } from "@/lib/i18n/server";
import { serialize } from "@/lib/money";
import { PageHeader } from "@/components/ui/misc";
import { NativeSelect } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/shared/data-table";

export const metadata = { title: "Agen" };
const STATUSES: AgentStatus[] = ["PENDING", "ACTIVE", "SUSPENDED", "REJECTED"];

export default async function AdminAgents({ searchParams }: { searchParams: Promise<{ status?: string; kyc?: string }> }) {
  await adminPage("agent.view");
  const { t, locale } = await getDictionary();
  const sp = await searchParams;
  const where: Prisma.AgentWhereInput = {
    deletedAt: null,
    ...(STATUSES.includes(sp.status as AgentStatus) ? { status: sp.status as AgentStatus } : {}),
    ...(sp.kyc === "SUBMITTED" ? { kyc: { status: "SUBMITTED" } } : {}),
  };
  const agents = await prisma.agent.findMany({
    where, orderBy: { createdAt: "desc" }, take: 2000,
    include: { kyc: { select: { status: true } }, wallet: true, referralsReceived: { where: { endedAt: null }, include: { referrer: { select: { agentCode: true } } } }, _count: { select: { attributions: { where: { effectiveTo: null } }, referralsMade: { where: { endedAt: null } } } } },
  });
  const rows = agents.map((a) => ({
    id: a.id, name: a.fullName, code: a.agentCode, status: a.status, kyc: a.kyc?.status ?? "NOT_SUBMITTED", city: `${a.city}, ${a.province}`, referrer: a.referralsReceived[0]?.referrer.agentCode ?? "—",
    merchants: a._count.attributions, recruits: a._count.referralsMade, payable: a.wallet?.payableBalance ?? 0n, joined: a.createdAt,
  }));
  return (
    <>
      <PageHeader title={t.nav.agents} description="Tinjau pendaftaran, KYC, dan status agen." />
      <form className="mb-4 flex flex-wrap items-end gap-2">
        <label className="grid gap-1 text-xs font-semibold">{t.common.status}<NativeSelect name="status" defaultValue={sp.status ?? ""} className="w-48"><option value="">{t.common.all}</option>{STATUSES.map((s) => <option key={s} value={s}>{t.status[s]}</option>)}</NativeSelect></label>
        <label className="grid gap-1 text-xs font-semibold">KYC<NativeSelect name="kyc" defaultValue={sp.kyc ?? ""} className="w-48"><option value="">{t.common.all}</option><option value="SUBMITTED">Menunggu verifikasi</option></NativeSelect></label>
        <Button type="submit" variant="outline">{t.common.apply}</Button>
      </form>
      <DataTable rows={serialize(rows)} locale={locale} statusLabels={t.status as unknown as Record<string, string>} searchPlaceholder="Cari nama, kode, kota…"
        columns={[
          { key: "name", header: "Agen", type: "link", href: "/admin/agents/{id}", sub: "code" }, { key: "status", header: "Status", type: "status" }, { key: "kyc", header: "KYC", type: "status" },
          { key: "city", header: "Wilayah" }, { key: "referrer", header: "Referrer", type: "mono" }, { key: "merchants", header: "Merchant", type: "number", align: "right" },
          { key: "recruits", header: "Rekrutan", type: "number", align: "right" }, { key: "payable", header: "Dapat ditarik", type: "money", align: "right" }, { key: "joined", header: "Terdaftar", type: "date" },
        ]} />
    </>
  );
}
