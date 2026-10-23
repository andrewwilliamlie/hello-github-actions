import "server-only";
import { prisma } from "../db";
import type { Actor } from "../rbac";

export async function listNotifications(actor: Actor, take = 50) {
  return prisma.notification.findMany({ where: { userId: actor.userId! }, orderBy: { createdAt: "desc" }, take });
}

export async function markNotificationsRead(actor: Actor, ids?: string[]) {
  await prisma.notification.updateMany({ where: { userId: actor.userId!, readAt: null, ...(ids ? { id: { in: ids } } : {}) }, data: { readAt: new Date() } });
}
