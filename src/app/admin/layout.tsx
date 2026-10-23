import { AppShell } from "@/components/layout/app-shell";
import type { NavGroup, NavItem } from "@/components/layout/sidebar";
import { getDictionary } from "@/lib/i18n/server";
import { pageContext } from "@/server/page-auth";
import { unreadCount } from "@/server/notifications/notify";
import { can, type Permission } from "@/server/rbac";
import { prisma } from "@/server/db";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { actor, session } = await pageContext("admin");
  const { t, locale } = await getDictionary();
  const n = t.nav;
  const [queue, wd, flags, exceptions] = await Promise.all([
    can(actor, "merchant.review") ? prisma.merchantLead.count({ where: { status: { in: ["APPLICATION_SUBMITTED", "UNDER_REVIEW"] } } }) : 0,
    can(actor, "withdrawal.review") ? prisma.withdrawalRequest.count({ where: { status: "REQUESTED" } }) : 0,
    can(actor, "fraud.manage") ? prisma.fraudFlag.count({ where: { status: "OPEN" } }) : 0,
    can(actor, "reconciliation.manage") ? prisma.reconciliationException.count({ where: { status: "OPEN" } }) : 0,
  ]);
  const item = (p: Permission, i: NavItem): NavItem[] => (can(actor, p) ? [i] : []);
  const groups: NavGroup[] = [
    { label: n.groupOverview, items: [...item("report.view", { href: "/admin", label: n.dashboard, icon: "LayoutDashboard" }), ...item("report.export", { href: "/admin/reports", label: n.reports, icon: "FileBarChart" })] },
    { label: n.groupNetwork, items: [
      ...item("agent.view", { href: "/admin/agents", label: n.agents, icon: "Users" }),
      ...item("agent.view", { href: "/admin/referrals", label: n.referrals, icon: "Network" }),
    ] },
    { label: n.groupSales, items: [
      ...item("merchant.view", { href: "/admin/leads", label: n.leads, icon: "ClipboardList", badge: queue }),
      ...item("merchant.view", { href: "/admin/merchants", label: n.merchants, icon: "Store" }),
      ...item("order.view", { href: "/admin/orders", label: n.orders, icon: "ShoppingCart" }),
      ...item("device.manage", { href: "/admin/inventory", label: n.inventory, icon: "Boxes" }),
      ...item("product.manage", { href: "/admin/products", label: n.products, icon: "Package" }),
    ] },
    { label: n.groupMoney, items: [
      ...item("rule.manage", { href: "/admin/rules", label: n.rules, icon: "Scale" }),
      ...item("commission.view", { href: "/admin/commissions", label: n.commissions, icon: "Coins" }),
      ...item("transaction.view", { href: "/admin/transactions", label: n.transactions, icon: "ArrowLeftRight" }),
      ...item("import.manage", { href: "/admin/imports", label: n.imports, icon: "Upload" }),
      ...item("reconciliation.manage", { href: "/admin/reconciliation", label: n.reconciliation, icon: "GitCompare", badge: exceptions }),
      ...item("withdrawal.review", { href: "/admin/withdrawals", label: n.withdrawals, icon: "HandCoins", badge: wd }),
      ...item("payout.create", { href: "/admin/payouts", label: n.payouts, icon: "Banknote" }),
    ] },
    { label: n.groupRisk, items: [
      ...item("dispute.manage", { href: "/admin/disputes", label: n.disputes, icon: "Gavel" }),
      ...item("fraud.manage", { href: "/admin/fraud", label: n.fraud, icon: "ShieldAlert", badge: flags }),
    ] },
    { label: n.groupPlatform, items: [
      ...item("notification.outbox", { href: "/admin/notifications", label: n.outbox, icon: "Mail" }),
      ...item("webhook.manage", { href: "/admin/integrations", label: n.integrations, icon: "Webhook" }),
      ...item("audit.view", { href: "/admin/audit", label: n.audit, icon: "ScrollText" }),
      ...item("settings.manage", { href: "/admin/settings", label: n.settings, icon: "Settings" }),
      ...item("user.manage", { href: "/admin/users", label: n.users, icon: "UserCog" }),
    ] },
  ].filter((g) => g.items.length);
  const roleLabel = session.roles.map((r) => r.replace("_", " ")).join(", ");
  return (
    <AppShell groups={groups} portalLabel="Konsol Admin" user={session.user} roleLabel={roleLabel} unread={await unreadCount(session.user.id)} t={t} locale={locale} searchAction="/admin/search" notificationsHref="/admin/inbox">
      {children}
    </AppShell>
  );
}
