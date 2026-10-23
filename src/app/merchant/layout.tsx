import { AppShell } from "@/components/layout/app-shell";
import { getDictionary } from "@/lib/i18n/server";
import { pageContext } from "@/server/page-auth";
import { unreadCount } from "@/server/notifications/notify";

export default async function MerchantLayout({ children }: { children: React.ReactNode }) {
  const { session } = await pageContext("merchant");
  const { t, locale } = await getDictionary();
  return (
    <AppShell groups={[{ items: [{ href: "/merchant", label: t.nav.merchantHome, icon: "Store" }] }]} portalLabel="Portal Merchant" user={session.user} roleLabel="Merchant" unread={await unreadCount(session.user.id)} t={t} locale={locale} notificationsHref="/merchant">
      {children}
    </AppShell>
  );
}
