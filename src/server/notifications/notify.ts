import "server-only";
import { prisma, type Db } from "../db";
import { renderTemplate, type TemplateKey } from "./templates";
import { enqueueJob } from "../jobs/queue";
import { maskEmail } from "@/lib/utils";

/**
 * Creates an in-app notification and queues external deliveries (email always; WhatsApp only with
 * opt-in consent and when enabled). Safe to call inside a transaction: deliveries run as jobs.
 */
export async function notifyUser(db: Db, userId: string, key: TemplateKey, vars: Record<string, string>, link?: string) {
  const user = await db.user.findUnique({ where: { id: userId }, select: { locale: true, email: true } });
  if (!user) return;
  const { title, body } = renderTemplate(key, vars, user.locale);
  const n = await db.notification.create({ data: { userId, type: key, title, body, link } });
  const delivery = await db.notificationDelivery.create({
    data: { notificationId: n.id, userId, channel: "EMAIL", provider: "pending", templateKey: key, toMasked: maskEmail(user.email), status: "QUEUED", payload: vars },
  });
  await enqueueJob(db, "notification.deliver", { deliveryId: delivery.id }, { dedupeKey: `deliver:${delivery.id}` });
  return n;
}

export async function notifyRole(db: Db, roles: ("SUPER_ADMIN" | "FINANCE_ADMIN" | "OPERATIONS_ADMIN")[], key: TemplateKey, vars: Record<string, string>, link?: string) {
  const users = await db.user.findMany({ where: { status: "ACTIVE", deletedAt: null, roles: { some: { role: { key: { in: roles } } } } }, select: { id: true } });
  for (const u of users) await notifyUser(db, u.id, key, vars, link);
}

export async function unreadCount(userId: string) {
  return prisma.notification.count({ where: { userId, readAt: null } });
}
