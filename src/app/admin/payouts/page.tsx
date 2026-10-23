import { adminPage } from "@/server/page-auth";
import { prisma } from "@/server/db";
import { getDictionary } from "@/lib/i18n/server";
import { serialize } from "@/lib/money";
import { PageHeader, Alert } from "@/components/ui/misc";
import { DataTable } from "@/components/shared/data-table";

export const metadata = { title: "Batch pembayaran" };

export default async function Payouts() {
  await adminPage("payout.create");
  const { t, locale } = await getDictionary();
  const batches = await prisma.payoutBatch.findMany({ orderBy: { createdAt: "desc" }, take: 500 });
  const users = new Map((await prisma.user.findMany({ where: { id: { in: batches.flatMap((b) => [b.createdById, b.approvedById].filter(Boolean) as string[]) } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  return (
    <>
      <PageHeader title={t.nav.payouts} description="Transfer bank manual. Sistem tidak pernah mensimulasikan transfer berhasil: status Dibayar hanya setelah transfer dicatat dan dikonfirmasi oleh pengguna berbeda." />
      <div className="mb-4"><Alert variant="info">Penyedia: <b>MANUAL_BANK_TRANSFER</b>. Antarmuka adaptor untuk API disbursement berlisensi tersedia di <code>src/server/payouts/provider.ts</code> (belum dikonfigurasi).</Alert></div>
      <DataTable rows={serialize(batches.map((b) => ({ id: b.id, number: `BATCH-${b.batchNumber}`, status: b.status, total: b.totalAmount, items: b.itemCount, maker: users.get(b.createdById) ?? "—", checker: b.approvedById ? users.get(b.approvedById) ?? "—" : "—", createdAt: b.createdAt })))} locale={locale} statusLabels={t.status as unknown as Record<string, string>} emptyTitle="Belum ada batch"
        columns={[{ key: "number", header: "Batch", type: "link", href: "/admin/payouts/{id}" }, { key: "status", header: "Status", type: "status" }, { key: "items", header: "Item", type: "number", align: "right" }, { key: "total", header: "Total", type: "money", align: "right" }, { key: "maker", header: "Maker" }, { key: "checker", header: "Checker" }, { key: "createdAt", header: "Dibuat", type: "datetime" }]} />
    </>
  );
}
