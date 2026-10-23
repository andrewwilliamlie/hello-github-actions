import type { MerchantStatus } from "@prisma/client";
import { adminPage } from "@/server/page-auth";
import { prisma } from "@/server/db";
import { getDictionary } from "@/lib/i18n/server";
import { serialize } from "@/lib/money";
import { PageHeader } from "@/components/ui/misc";
import { NativeSelect } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/shared/data-table";

export const metadata = { title: "Merchant" };
const ALL: MerchantStatus[] = ["APPROVED", "PAYMENT_VERIFIED", "DEVICE_ASSIGNED", "ACTIVATED", "COMMISSION_ELIGIBLE", "SUSPENDED", "REFUNDED", "CANCELLED"];

export default async function AdminMerchants({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await adminPage("merchant.view");
  const { t, locale } = await getDictionary();
  const sp = await searchParams;
  const merchants = await prisma.merchant.findMany({
    where: { deletedAt: null, ...(ALL.includes(sp.status as MerchantStatus) ? { status: sp.status as MerchantStatus } : {}) },
    include: { attributions: { where: { effectiveTo: null }, include: { agent: { select: { fullName: true, agentCode: true } } } }, _count: { select: { transactions: true, devices: true } } },
    orderBy: { merchantNumber: "desc" }, take: 3000,
  });
  const rows = merchants.map((m) => ({ id: m.id, name: m.businessName, code: m.merchantCode, status: m.status, agent: m.attributions[0]?.agent.fullName ?? "—", agentCode: m.attributions[0]?.agent.agentCode ?? "", region: `${m.city}, ${m.province}`, devices: m._count.devices, txns: m._count.transactions, approvedAt: m.approvedAt }));
  return (
    <>
      <PageHeader title={t.nav.merchants} description="ID merchant bersifat permanen. Atribusi agen hanya dapat diubah oleh Super Admin dengan alasan." />
      <form className="mb-4 flex items-end gap-2">
        <label className="grid gap-1 text-xs font-semibold">{t.common.status}<NativeSelect name="status" defaultValue={sp.status ?? ""} className="w-60"><option value="">{t.common.all}</option>{ALL.map((s) => <option key={s} value={s}>{t.status[s]}</option>)}</NativeSelect></label>
        <Button type="submit" variant="outline">{t.common.apply}</Button>
      </form>
      <DataTable rows={serialize(rows)} locale={locale} statusLabels={t.status as unknown as Record<string, string>}
        columns={[
          { key: "name", header: "Merchant", type: "link", href: "/admin/merchants/{id}", sub: "code" }, { key: "status", header: "Status", type: "status" }, { key: "agent", header: "Agen", sub: "agentCode" },
          { key: "region", header: "Wilayah" }, { key: "devices", header: "Perangkat", type: "number", align: "right" }, { key: "txns", header: "Transaksi", type: "number", align: "right" }, { key: "approvedAt", header: "Disetujui", type: "date" },
        ]} />
    </>
  );
}
