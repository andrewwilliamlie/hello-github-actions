import "server-only";
import { prisma } from "../db";
import { emailProvider } from "./email";
import { whatsAppProvider, WHATSAPP_TEMPLATES } from "./whatsapp";
import { renderTemplate, type TemplateKey } from "./templates";
import { getSetting } from "../settings";
import { maskPhone } from "@/lib/utils";

/** Job handler: performs the external delivery for one NotificationDelivery row. */
export async function deliverNotification(deliveryId: string): Promise<void> {
  const d = await prisma.notificationDelivery.findUnique({ where: { id: deliveryId } });
  if (!d || d.status !== "QUEUED" || !d.userId) return;
  const user = await prisma.user.findUnique({ where: { id: d.userId }, include: { agent: true } });
  if (!user) return;
  const vars = (d.payload ?? {}) as Record<string, string>;
  const { title, body } = renderTemplate(d.templateKey as TemplateKey, vars, user.locale);

  if (d.channel === "EMAIL") {
    const provider = emailProvider();
    const res = await provider.send({ to: user.email, subject: `[Hausjo] ${title}`, text: body });
    await prisma.notificationDelivery.update({
      where: { id: d.id },
      data: { provider: provider.name, status: provider.isMock ? "MOCK_DELIVERED" : "SENT", providerMessageId: res.messageId, sentAt: new Date() },
    });
  }

  // WhatsApp: only with explicit opt-in, feature enabled, and an approved template.
  const waTemplate = WHATSAPP_TEMPLATES[d.templateKey];
  if (d.channel === "EMAIL" && waTemplate && user.agent && (await getSetting("notifications.whatsappEnabled"))) {
    const provider = whatsAppProvider();
    const consent = user.agent.whatsappOptIn;
    const row = await prisma.notificationDelivery.create({
      data: { notificationId: d.notificationId, userId: user.id, channel: "WHATSAPP", provider: provider.name, templateKey: d.templateKey, toMasked: maskPhone(user.agent.phone), status: consent ? "QUEUED" : "SKIPPED_NO_CONSENT", payload: vars },
    });
    if (consent) {
      const res = await provider.sendTemplate({ to: user.agent.phone, template: waTemplate, language: user.locale === "en" ? "en" : "id", variables: Object.values(vars) });
      await prisma.notificationDelivery.update({ where: { id: row.id }, data: { status: provider.isMock ? "MOCK_DELIVERED" : "SENT", providerMessageId: res.messageId, sentAt: new Date() } });
    }
  }
}
