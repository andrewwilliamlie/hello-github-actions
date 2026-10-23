import { adminPage } from "@/server/page-auth";
import { prisma } from "@/server/db";
import { getDictionary } from "@/lib/i18n/server";
import { serialize } from "@/lib/money";
import { PageHeader } from "@/components/ui/misc";
import { DataTable } from "@/components/shared/data-table";

export const metadata = { title: "Pesanan" };

export default async function AdminOrders() {
  await adminPage("order.view");
  const { t, locale } = await getDictionary();
  const orders = await prisma.salesOrder.findMany({ include: { merchant: { select: { id: true, businessName: true, merchantCode: true } }, product: { select: { name: true } }, agent: { select: { agentCode: true } }, payments: true }, orderBy: { createdAt: "desc" }, take: 3000 });
  const rows = orders.map((o) => ({
    id: o.merchant.id, number: `ORD-${o.orderNumber}`, merchant: o.merchant.businessName, code: o.merchant.merchantCode, product: o.product.name, agent: o.agent.agentCode, total: o.totalAmount, status: o.status,
    payment: o.payments.some((p) => p.status === "SUBMITTED") ? "SUBMITTED" : o.payments.some((p) => p.status === "VERIFIED") ? "VERIFIED" : o.payments.some((p) => p.status === "REFUNDED") ? "REFUNDED" : "NONE", createdAt: o.createdAt,
  }));
  return (
    <>
      <PageHeader title={t.nav.orders} description="Status pembayaran 'Diajukan' perlu diverifikasi di halaman merchant." />
      <DataTable rows={serialize(rows)} locale={locale} statusLabels={t.status as unknown as Record<string, string>}
        columns={[
          { key: "number", header: "Pesanan", type: "link", href: "/admin/merchants/{id}" }, { key: "merchant", header: "Merchant", sub: "code" }, { key: "product", header: "Produk" }, { key: "agent", header: "Agen", type: "mono" },
          { key: "total", header: "Total", type: "money", align: "right" }, { key: "payment", header: "Pembayaran", type: "status" }, { key: "status", header: "Status", type: "status" }, { key: "createdAt", header: "Dibuat", type: "date" },
        ]} />
    </>
  );
}
