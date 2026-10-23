import { pageContext } from "@/server/page-auth";
import { listNotifications } from "@/server/modules/notifications";
import { getDictionary } from "@/lib/i18n/server";
import { NotificationList } from "@/components/shared/notification-list";
import { adminMarkReadAction } from "../actions";

export const metadata = { title: "Notifikasi" };

export default async function AdminInbox() {
  const { actor } = await pageContext("admin");
  const { t, locale } = await getDictionary();
  return <NotificationList items={await listNotifications(actor, 100)} t={t} locale={locale} markAll={adminMarkReadAction} />;
}
