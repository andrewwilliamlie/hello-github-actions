import { AppShell } from "@/components/layout/app-shell";
import type { NavGroup } from "@/components/layout/sidebar";
import { getDictionary } from "@/lib/i18n/server";
import { pageContext } from "@/server/page-auth";
import { unreadCount } from "@/server/notifications/notify";

export default async function AgentLayout({ children }: { children: React.ReactNode }) {
  const { session } = await pageContext("agent");
  const { t, locale } = await getDictionary();
  const n = t.nav;
  const groups: NavGroup[] = [
    { items: [
      { href: "/agent", label: n.dashboard, icon: "LayoutDashboard" },
      { href: "/agent/onboarding", label: n.onboarding, icon: "ListChecks" },
      { href: "/agent/merchants", label: n.merchants, icon: "Store" },
      { href: "/agent/earnings", label: n.earnings, icon: "Coins" },
      { href: "/agent/wallet", label: n.wallet, icon: "Wallet" },
      { href: "/agent/referrals", label: n.referrals, icon: "Network" },
    ] },
    { items: [
      { href: "/agent/notifications", label: n.notifications, icon: "Bell" },
      { href: "/agent/profile", label: n.profile, icon: "UserCircle" },
    ] },
  ];
  return (
    <AppShell
      groups={groups} portalLabel="Portal Agen" user={session.user} roleLabel="Agen" unread={await unreadCount(session.user.id)} t={t} locale={locale}
      searchAction="/agent/merchants" notificationsHref="/agent/notifications" profileHref="/agent/profile"
    >
      {children}
    </AppShell>
  );
}
