import { pageContext } from "@/server/page-auth";
import { listNotifications } from "@/server/modules/notifications";
import { getDictionary } from "@/lib/i18n/server";
import { NotificationList } from "@/components/shared/notification-list";
import { markReadAction } from "../actions";

export const metadata = { title: "Notifikasi" };

export default async function AgentNotifications() {
  const { actor } = await pageContext("agent");
  const { t, locale } = await getDictionary();
  const items = await listNotifications(actor, 100);
  return <NotificationList items={items} t={t} locale={locale} markAll={markReadAction} />;
}
