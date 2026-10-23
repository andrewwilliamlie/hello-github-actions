import type { Prisma } from "@prisma/client";
import { adminPage } from "@/server/page-auth";
import { prisma } from "@/server/db";
import { getDictionary } from "@/lib/i18n/server";
import { serialize } from "@/lib/money";
import { PageHeader } from "@/components/ui/misc";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/shared/data-table";

export const metadata = { title: "Log audit" };

export default async function Audit({ searchParams }: { searchParams: Promise<{ action?: string; entity?: string; entityId?: string }> }) {
  await adminPage("audit.view");
  const { t, locale } = await getDictionary();
  const sp = await searchParams;
  const where: Prisma.AuditLogWhereInput = {
    ...(sp.action ? { action: { contains: sp.action } } : {}), ...(sp.entity ? { entityType: sp.entity } : {}), ...(sp.entityId ? { entityId: sp.entityId } : {}),
  };
  const logs = await prisma.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, take: 2000 });
  const users = new Map((await prisma.user.findMany({ where: { id: { in: [...new Set(logs.map((l) => l.actorUserId).filter(Boolean) as string[])] } }, select: { id: true, email: true } })).map((u) => [u.id, u.email]));
  return (
    <>
      <PageHeader title={t.nav.audit} description="Catatan tidak dapat diubah (append-only di tingkat database). Nilai sensitif disamarkan." />
      <form className="mb-4 flex flex-wrap items-end gap-2">
        <Input name="action" placeholder="aksi, mis. payout" defaultValue={sp.action} className="w-48" aria-label="Aksi" />
        <Input name="entity" placeholder="entitas, mis. Agent" defaultValue={sp.entity} className="w-48" aria-label="Entitas" />
        <Input name="entityId" placeholder="ID entitas" defaultValue={sp.entityId} className="w-56" aria-label="ID entitas" />
        <Button type="submit" variant="outline">{t.common.filter}</Button>
      </form>
      <DataTable rows={serialize(logs.map((l) => ({ at: l.createdAt, actor: l.actorUserId ? users.get(l.actorUserId) ?? l.actorUserId : l.actorRole ?? "system", role: l.actorRole ?? "", action: l.action, entity: `${l.entityType}${l.entityId ? `:${l.entityId}` : ""}`, change: JSON.stringify({ before: l.before, after: l.after, meta: l.metadata }).slice(0, 220), ip: l.ip ?? "" })))} locale={locale} pageSize={50}
        columns={[{ key: "at", header: "Waktu", type: "datetime" }, { key: "actor", header: "Pelaku", sub: "role" }, { key: "action", header: "Aksi", type: "mono" }, { key: "entity", header: "Entitas", type: "mono" }, { key: "change", header: "Perubahan", type: "mono" }, { key: "ip", header: "IP" }]} />
    </>
  );
}
