import Link from "next/link";
import { Bell, Search } from "lucide-react";
import { Sidebar, MobileNav, type NavGroup } from "./sidebar";
import { UserMenu } from "./user-menu";
import { LangToggle } from "@/components/shared/lang-toggle";
import { I18nProvider } from "@/lib/i18n/client";
import type { Dictionary } from "@/lib/i18n/id";
import { logoutAction } from "@/app/(auth)/actions";
import { env } from "@/server/env";

export function AppShell({
  children, groups, portalLabel, user, roleLabel, unread, t, locale, searchAction, notificationsHref, profileHref, topNotice,
}: {
  children: React.ReactNode; groups: NavGroup[]; portalLabel: string; user: { name: string; email: string }; roleLabel: string; unread: number;
  t: Dictionary; locale: "id" | "en"; searchAction?: string; notificationsHref: string; profileHref?: string; topNotice?: React.ReactNode;
}) {
  const e = env();
  const mock = e.SMS_PROVIDER === "mock" || e.EMAIL_PROVIDER === "mock" || e.WHATSAPP_PROVIDER === "mock";
  return (
    <I18nProvider t={t} locale={locale}>
      <div className="flex min-h-screen">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:p-2">Lewati ke konten</a>
        <Sidebar groups={groups} portalLabel={portalLabel} />
        <div className="flex min-w-0 flex-1 flex-col">
          {(e.DEMO_MODE || mock) && (
            <div className="no-print flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-violet-200 bg-violet-50 px-4 py-1.5 text-xs text-violet-900">
              {e.DEMO_MODE && <span><b>DEMO</b> · {t.common.demoBanner}</span>}
              {mock && <span><b>MOCK</b> · {t.common.mockBanner}</span>}
            </div>
          )}
          <header className="no-print sticky top-0 z-30 flex h-16 items-center gap-2 border-b bg-card/95 px-4 backdrop-blur">
            <MobileNav groups={groups} portalLabel={portalLabel} />
            {searchAction ? (
              <form action={searchAction} className="relative hidden max-w-md flex-1 md:block" role="search">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <input name="q" aria-label={t.common.search} placeholder={t.common.searchPlaceholder} className="h-10 w-full rounded-lg border bg-background pl-9 pr-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
              </form>
            ) : (
              <div className="flex-1" />
            )}
            <div className="ml-auto flex items-center gap-1">
              <LangToggle locale={locale} />
              <Link href={notificationsHref} className="relative rounded-lg p-2 hover:bg-muted" aria-label={`${t.common.notifications} (${unread})`}>
                <Bell className="size-5" />
                {unread > 0 && <span className="absolute right-1 top-1 grid min-w-4 place-items-center rounded-full bg-destructive px-1 text-[10px] font-bold text-white">{unread > 99 ? "99+" : unread}</span>}
              </Link>
              <UserMenu name={user.name} email={user.email} roleLabel={roleLabel} profileHref={profileHref} logout={logoutAction} logoutLabel={t.common.logout} />
            </div>
          </header>
          {topNotice}
          <main id="main" className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
        </div>
      </div>
    </I18nProvider>
  );
}
