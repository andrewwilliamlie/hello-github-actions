import { prisma } from "@/server/db";
import type { Actor } from "@/server/rbac";
import { createLead, uploadLeadDocument, agentLeadTransition, reviewLead, submitPayment, verifyPayment, assignDevice, activateDevice } from "@/server/modules/merchants";
import { LEAD } from "./fixtures";
import { png } from "./files";

/** Drive a lead all the way to an activated device. Returns ids. */
export async function onboardAndActivate(agent: Actor, ops: Actor, opts: { productId: string; n: number; serial: string; terminalId: string; activatedAt?: Date }) {
  const lead = await createLead(agent, LEAD(opts.productId, opts.n));
  await uploadLeadDocument(agent, lead.id, "OWNER_ID_CARD", png("ktp.png"));
  await uploadLeadDocument(agent, lead.id, "STORE_PHOTO", png("store.png"));
  await agentLeadTransition(agent, lead.id, "submit");
  await reviewLead(ops, lead.id, "start_review");
  const approved = await reviewLead(ops, lead.id, "approve");
  const order = await prisma.salesOrder.findFirstOrThrow({ where: { merchantId: approved.merchantId! } });
  const payment = await submitPayment(agent, order.id, { amount: order.totalAmount, method: "BANK_TRANSFER", reference: `PAY-${opts.n}-${opts.serial}` });
  await verifyPayment(ops, payment.id, "VERIFIED");
  const device = await prisma.device.findUniqueOrThrow({ where: { serialNumber: opts.serial } });
  await assignDevice(ops, order.id, device.id);
  await activateDevice(ops, order.id, { terminalId: opts.terminalId, activatedAt: opts.activatedAt });
  return { leadId: lead.id, merchantId: approved.merchantId!, orderId: order.id, deviceId: device.id };
}
