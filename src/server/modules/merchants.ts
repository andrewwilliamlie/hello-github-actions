import "server-only";
import { z } from "zod";
import type { LeadStatus, MerchantDocumentType, PaymentMethod, Prisma } from "@prisma/client";
import { prisma, withTx, isUniqueViolation, type Tx } from "../db";
import { audit } from "../audit";
import { getSetting } from "../settings";
import { notifyRole, notifyUser } from "../notifications/notify";
import { storeUpload } from "../storage/files";
import { enqueueJob } from "../jobs/queue";
import { accrueSalesCommission, reverseCommissionEvent } from "./commissions";
import { currentPrice } from "./products";
import { can, requireAgent, requirePermission, type Actor } from "../rbac";
import { AppError, duplicate, forbidden, invalid, notFound, rule } from "../errors";
import { formatCode, normalizeName, normalizePhone } from "@/lib/utils";
import { hashPassword } from "../auth/password";
import { randomToken } from "../crypto";

export const leadSchema = z.object({
  businessName: z.string().trim().min(2).max(150),
  ownerName: z.string().trim().min(2).max(100),
  phone: z.string().transform((v, ctx) => {
    const p = normalizePhone(v);
    if (!p) ctx.addIssue({ code: "custom", message: "Nomor ponsel tidak valid" });
    return p ?? "";
  }),
  email: z.string().trim().toLowerCase().email().optional().or(z.literal("").transform(() => undefined)),
  businessType: z.string().trim().min(2).max(80),
  addressLine: z.string().trim().min(5).max(300),
  city: z.string().trim().min(2).max(100),
  province: z.string().trim().min(2).max(100),
  postalCode: z.string().trim().regex(/^\d{5}$/).optional().or(z.literal("").transform(() => undefined)),
  latitude: z.preprocess((v) => (v === "" || v === null || v === undefined ? undefined : Number(v)), z.number().min(-11).max(6).optional()),
  longitude: z.preprocess((v) => (v === "" || v === null || v === undefined ? undefined : Number(v)), z.number().min(95).max(141).optional()),
  productId: z.string().min(1, "Pilih produk"),
  notes: z.string().trim().max(1000).optional(),
});
export type LeadInput = z.input<typeof leadSchema>;

export const dedupeKeyFor = (phone: string, businessName: string) => `${phone}|${normalizeName(businessName)}`;

const OPEN_LEAD: LeadStatus[] = ["LEAD", "CONTACTED", "APPLICATION_SUBMITTED", "UNDER_REVIEW", "REVISION_REQUESTED"];

async function requireActiveAgent(tx: Tx | typeof prisma, agentId: string) {
  const a = await tx.agent.findUniqueOrThrow({ where: { id: agentId } });
  if (a.status !== "ACTIVE") throw rule("Akun agen Anda belum aktif. Selesaikan onboarding dan tunggu persetujuan.");
  return a;
}

/** Duplicate protection: same merchant cannot be claimed twice (by any agent). */
async function assertNotDuplicate(tx: Tx | typeof prisma, dedupeKey: string, exceptLeadId?: string) {
  const merchant = await tx.merchant.findUnique({ where: { dedupeKey } });
  if (merchant) throw duplicate("Merchant ini sudah terdaftar di Hausjo.");
  const lead = await tx.merchantLead.findFirst({ where: { dedupeKey, status: { in: OPEN_LEAD }, deletedAt: null, ...(exceptLeadId ? { id: { not: exceptLeadId } } : {}) } });
  if (lead) throw duplicate("Merchant ini sedang diproses oleh agen lain atau oleh Anda.");
}

export async function createLead(actor: Actor, raw: LeadInput, opts: { importRowId?: string; agentIdOverride?: string } = {}) {
  let agentId: string;
  if (opts.agentIdOverride) {
    requirePermission(actor, "import.manage");
    agentId = opts.agentIdOverride;
  } else agentId = requireAgent(actor);
  const input = leadSchema.parse(raw);
  const dedupeKey = dedupeKeyFor(input.phone, input.businessName);
  return withTx(async (tx) => {
    await requireActiveAgent(tx, agentId);
    const product = await tx.product.findFirst({ where: { id: input.productId, isActive: true, deletedAt: null } });
    if (!product) throw invalid("Produk tidak tersedia.");
    await assertNotDuplicate(tx, dedupeKey);
    const lead = await tx.merchantLead.create({ data: { ...input, agentId, dedupeKey, importRowId: opts.importRowId } });
    await audit(tx, actor, { action: "lead.create", entityType: "MerchantLead", entityId: lead.id, after: { businessName: lead.businessName } });
    return lead;
  });
}

async function loadLeadForActor(tx: Tx | typeof prisma, actor: Actor, leadId: string, write = false) {
  const lead = await tx.merchantLead.findFirst({ where: { id: leadId, deletedAt: null } });
  if (!lead) throw notFound("Lead");
  if (actor.agentId && lead.agentId === actor.agentId) return lead;
  if (!can(actor, write ? "merchant.review" : "merchant.view")) throw forbidden();
  return lead;
}

export async function updateLead(actor: Actor, leadId: string, raw: LeadInput) {
  const agentId = requireAgent(actor);
  const input = leadSchema.parse(raw);
  return withTx(async (tx) => {
    const lead = await loadLeadForActor(tx, actor, leadId);
    if (lead.agentId !== agentId) throw forbidden();
    if (!["LEAD", "CONTACTED", "REVISION_REQUESTED"].includes(lead.status)) throw rule("Lead tidak dapat diubah pada status ini.");
    const dedupeKey = dedupeKeyFor(input.phone, input.businessName);
    if (dedupeKey !== lead.dedupeKey) await assertNotDuplicate(tx, dedupeKey, lead.id);
    const updated = await tx.merchantLead.update({ where: { id: lead.id }, data: { ...input, dedupeKey } });
    await audit(tx, actor, { action: "lead.update", entityType: "MerchantLead", entityId: lead.id, before: lead, after: updated });
    return updated;
  });
}

export async function uploadLeadDocument(actor: Actor, leadId: string, type: MerchantDocumentType, file: { buffer: Buffer; filename: string }) {
  const lead = await loadLeadForActor(prisma, actor, leadId);
  if (actor.agentId !== lead.agentId && !can(actor, "merchant.review")) throw forbidden();
  if (!OPEN_LEAD.includes(lead.status) && lead.status !== "APPROVED") throw rule("Dokumen tidak dapat ditambahkan pada status ini.");
  const stored = await storeUpload({ ...file, purpose: "MERCHANT_DOCUMENT", allowed: ["jpeg", "png", "webp", "pdf"], uploadedById: actor.userId, ownerAgentId: lead.agentId });
  return prisma.$transaction(async (tx) => {
    const doc = await tx.merchantDocument.create({ data: { leadId, merchantId: lead.merchantId, type, fileId: stored.id } });
    await audit(tx, actor, { action: "lead.document.upload", entityType: "MerchantLead", entityId: leadId, after: { type, fileId: stored.id } });
    return doc;
  });
}

/** Agent-driven transitions: LEAD → CONTACTED → APPLICATION_SUBMITTED; resubmit after revision; cancel. */
export async function agentLeadTransition(actor: Actor, leadId: string, action: "contacted" | "submit" | "cancel") {
  const agentId = requireAgent(actor);
  return withTx(async (tx) => {
    const lead = await loadLeadForActor(tx, actor, leadId);
    if (lead.agentId !== agentId) throw forbidden();
    let next: LeadStatus;
    if (action === "contacted") {
      if (lead.status !== "LEAD") throw rule("Hanya lead baru yang dapat ditandai dihubungi.");
      next = "CONTACTED";
    } else if (action === "submit") {
      if (!["LEAD", "CONTACTED", "REVISION_REQUESTED"].includes(lead.status)) throw rule("Aplikasi tidak dapat diajukan pada status ini.");
      await requireActiveAgent(tx, agentId);
      const required = await getSetting("merchant.requiredDocuments", tx);
      const docs = await tx.merchantDocument.findMany({ where: { leadId, status: { not: "REJECTED" } }, select: { type: true } });
      const missing = required.filter((r) => !docs.some((d) => d.type === r));
      if (missing.length) throw rule(`Dokumen wajib belum lengkap: ${missing.join(", ")}`, { missing });
      next = "APPLICATION_SUBMITTED";
    } else {
      if (!OPEN_LEAD.includes(lead.status) || lead.status === "UNDER_REVIEW") throw rule("Lead tidak dapat dibatalkan pada status ini.");
      next = "CANCELLED";
    }
    const updated = await tx.merchantLead.update({ where: { id: lead.id }, data: { status: next, ...(next === "APPLICATION_SUBMITTED" ? { submittedAt: new Date(), revisionNote: null } : {}) } });
    await audit(tx, actor, { action: `lead.${action}`, entityType: "MerchantLead", entityId: lead.id, before: { status: lead.status }, after: { status: next } });
    if (next === "APPLICATION_SUBMITTED") {
      const agent = await tx.agent.findUniqueOrThrow({ where: { id: agentId } });
      await notifyRole(tx, ["OPERATIONS_ADMIN"], "merchant.submitted", { merchant: lead.businessName, agent: agent.fullName }, `/admin/leads/${lead.id}`);
    }
    return updated;
  });
}

/** Operations review: start review, request revision, reject, approve. Approval creates the Merchant + order. */
export async function reviewLead(actor: Actor, leadId: string, decision: "start_review" | "request_revision" | "reject" | "approve", note?: string) {
  requirePermission(actor, "merchant.review");
  try {
    return await withTx(async (tx) => {
      const lead = await tx.merchantLead.findFirst({ where: { id: leadId, deletedAt: null }, include: { agent: true, product: true } });
      if (!lead) throw notFound("Lead");
      const from = lead.status;
      if (decision === "start_review") {
        if (from !== "APPLICATION_SUBMITTED") throw rule("Hanya aplikasi yang diajukan yang dapat ditinjau.");
        await tx.merchantLead.update({ where: { id: lead.id }, data: { status: "UNDER_REVIEW", reviewedById: actor.userId } });
      } else if (decision === "request_revision" || decision === "reject") {
        if (!["APPLICATION_SUBMITTED", "UNDER_REVIEW"].includes(from)) throw rule("Aplikasi tidak dalam peninjauan.");
        if (!note || note.trim().length < 5) throw invalid("Catatan wajib diisi.");
        await tx.merchantLead.update({
          where: { id: lead.id },
          data: decision === "reject" ? { status: "REJECTED", rejectionReason: note, reviewedAt: new Date(), reviewedById: actor.userId } : { status: "REVISION_REQUESTED", revisionNote: note, reviewedById: actor.userId },
        });
        await notifyUser(tx, lead.agent.userId, decision === "reject" ? "merchant.rejected" : "merchant.revision", { merchant: lead.businessName, note, reason: note }, `/agent/merchants/${lead.id}`);
      } else {
        if (!["APPLICATION_SUBMITTED", "UNDER_REVIEW"].includes(from)) throw rule("Aplikasi tidak dalam peninjauan.");
        if (lead.agent.status !== "ACTIVE") throw rule("Agen pengaju tidak aktif.");
        const price = await currentPrice(tx, lead.productId, new Date());
        if (price === null) throw rule("Harga produk belum diatur.");
        const merchant = await tx.merchant.create({
          data: {
            merchantCode: `TMP-${lead.id}`, businessName: lead.businessName, ownerName: lead.ownerName, phone: lead.phone, email: lead.email, businessType: lead.businessType,
            addressLine: lead.addressLine, city: lead.city, province: lead.province, postalCode: lead.postalCode, latitude: lead.latitude, longitude: lead.longitude,
            dedupeKey: lead.dedupeKey, approvedById: actor.userId,
          },
        });
        await tx.merchant.update({ where: { id: merchant.id }, data: { merchantCode: formatCode("HJM", merchant.merchantNumber) } });
        await tx.merchantAttribution.create({ data: { merchantId: merchant.id, agentId: lead.agentId, effectiveFrom: new Date(), reason: "Initial attribution: onboarding agent", createdById: actor.userId, approvedById: actor.userId } });
        await tx.merchantDocument.updateMany({ where: { leadId: lead.id }, data: { merchantId: merchant.id } });
        await tx.salesOrder.create({ data: { merchantId: merchant.id, productId: lead.productId, sellingAgentId: lead.agentId, unitPrice: price, totalAmount: price, createdById: actor.userId } });
        await tx.merchantLead.update({ where: { id: lead.id }, data: { status: "APPROVED", merchantId: merchant.id, reviewedAt: new Date(), reviewedById: actor.userId } });
        const code = formatCode("HJM", merchant.merchantNumber);
        await notifyUser(tx, lead.agent.userId, "merchant.approved", { merchant: lead.businessName, merchantCode: code }, `/agent/merchants/${lead.id}`);
      }
      await audit(tx, actor, { action: `lead.${decision}`, entityType: "MerchantLead", entityId: lead.id, before: { status: from }, after: { note } });
      return tx.merchantLead.findUniqueOrThrow({ where: { id: lead.id } });
    });
  } catch (e) {
    if (isUniqueViolation(e, "dedupeKey")) throw duplicate("Merchant dengan data yang sama sudah terdaftar.");
    throw e;
  }
}

// ─────────────────────────────── Payments ───────────────────────────────

export async function submitPayment(actor: Actor, orderId: string, input: { amount: bigint; method: PaymentMethod; reference: string; payerName?: string; proof?: { buffer: Buffer; filename: string } }) {
  const order = await prisma.salesOrder.findUnique({ where: { id: orderId } });
  if (!order) throw notFound("Pesanan");
  const isOwner = actor.agentId === order.sellingAgentId;
  if (!isOwner) requirePermission(actor, "payment.verify");
  if (order.status !== "AWAITING_PAYMENT") throw rule("Pesanan tidak menunggu pembayaran.");
  if (input.amount <= 0n) throw invalid("Jumlah pembayaran tidak valid.");
  if (!input.reference.trim()) throw invalid("Nomor referensi pembayaran wajib diisi.");
  const proof = input.proof ? await storeUpload({ ...input.proof, purpose: "PAYMENT_PROOF", allowed: ["jpeg", "png", "webp", "pdf"], uploadedById: actor.userId, ownerAgentId: order.sellingAgentId }) : null;
  try {
    return await withTx(async (tx) => {
      const p = await tx.payment.create({ data: { orderId, amount: input.amount, method: input.method, reference: input.reference.trim(), payerName: input.payerName, proofFileId: proof?.id } });
      await audit(tx, actor, { action: "payment.submit", entityType: "Payment", entityId: p.id, after: { amount: input.amount, method: input.method } });
      return p;
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw duplicate("Referensi pembayaran ini sudah pernah dicatat.");
    throw e;
  }
}

export async function verifyPayment(actor: Actor, paymentId: string, decision: "VERIFIED" | "REJECTED") {
  requirePermission(actor, "payment.verify");
  return withTx(async (tx) => {
    const p = await tx.payment.findUnique({ where: { id: paymentId }, include: { order: { include: { merchant: true } } } });
    if (!p) throw notFound("Pembayaran");
    if (p.status !== "SUBMITTED") throw rule("Pembayaran sudah diproses.");
    await tx.payment.update({ where: { id: p.id }, data: { status: decision, verifiedById: actor.userId, verifiedAt: new Date() } });
    if (decision === "VERIFIED") {
      const verified = await tx.payment.aggregate({ where: { orderId: p.orderId, status: "VERIFIED" }, _sum: { amount: true } });
      if ((verified._sum.amount ?? 0n) >= p.order.totalAmount && p.order.status === "AWAITING_PAYMENT") {
        await tx.salesOrder.update({ where: { id: p.orderId }, data: { status: "PAYMENT_VERIFIED" } });
        await tx.merchant.updateMany({ where: { id: p.order.merchantId, status: "APPROVED" }, data: { status: "PAYMENT_VERIFIED" } });
      }
    }
    await audit(tx, actor, { action: `payment.${decision.toLowerCase()}`, entityType: "Payment", entityId: p.id, before: { status: p.status }, after: { status: decision } });
  });
}

// ─────────────────────────────── Devices ───────────────────────────────

export async function assignDevice(actor: Actor, orderId: string, deviceId: string) {
  requirePermission(actor, "device.manage");
  try {
    return await withTx(async (tx) => {
      const order = await tx.salesOrder.findUnique({ where: { id: orderId } });
      if (!order) throw notFound("Pesanan");
      if (order.status !== "PAYMENT_VERIFIED") throw rule("Perangkat hanya dapat ditetapkan setelah pembayaran terverifikasi.");
      // Atomic claim: only an IN_STOCK device of the right product can be assigned.
      const claimed = await tx.device.updateMany({ where: { id: deviceId, status: "IN_STOCK", productId: order.productId, orderId: null }, data: { status: "ASSIGNED", orderId, merchantId: order.merchantId } });
      if (claimed.count !== 1) throw rule("Perangkat tidak tersedia atau tidak sesuai produk pesanan.");
      await tx.inventoryMovement.create({ data: { deviceId, type: "ASSIGNED", fromStatus: "IN_STOCK", toStatus: "ASSIGNED", orderId, merchantId: order.merchantId, actorId: actor.userId } });
      await tx.salesOrder.update({ where: { id: orderId }, data: { status: "DEVICE_ASSIGNED" } });
      await tx.merchant.updateMany({ where: { id: order.merchantId, status: { in: ["APPROVED", "PAYMENT_VERIFIED"] } }, data: { status: "DEVICE_ASSIGNED" } });
      await audit(tx, actor, { action: "device.assign", entityType: "SalesOrder", entityId: orderId, after: { deviceId } });
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw duplicate("Perangkat atau pesanan sudah memiliki penetapan.");
    throw e;
  }
}

/** Activation: requires assigned device; sets unique terminal ID; accrues the sales commission. */
export async function activateDevice(actor: Actor, orderId: string, input: { terminalId: string; activatedAt?: Date }) {
  requirePermission(actor, "device.activate");
  const terminalId = input.terminalId.trim().toUpperCase();
  if (!/^[A-Z0-9-]{4,32}$/.test(terminalId)) throw invalid("Terminal ID tidak valid.");
  const activatedAt = input.activatedAt ?? new Date();
  if (activatedAt > new Date()) throw invalid("Tanggal aktivasi tidak boleh di masa depan.");
  try {
    return await withTx(async (tx) => {
      const order = await tx.salesOrder.findUnique({ where: { id: orderId }, include: { device: true, merchant: true, product: true, agent: true } });
      if (!order) throw notFound("Pesanan");
      if (order.status !== "DEVICE_ASSIGNED" || !order.device) throw rule("Perangkat harus ditetapkan sebelum aktivasi.");
      if (order.merchant.status === "SUSPENDED") throw rule("Merchant ditangguhkan.");
      await tx.device.update({ where: { id: order.device.id }, data: { status: "ACTIVE", terminalId } });
      await tx.activation.create({ data: { orderId, deviceId: order.device.id, merchantId: order.merchantId, terminalId, activatedAt, activatedById: actor.userId } });
      await tx.inventoryMovement.create({ data: { deviceId: order.device.id, type: "ACTIVATED", fromStatus: "ASSIGNED", toStatus: "ACTIVE", orderId, merchantId: order.merchantId, actorId: actor.userId, note: `TID ${terminalId}` } });
      await tx.salesOrder.update({ where: { id: orderId }, data: { status: "ACTIVATED" } });
      await tx.merchant.updateMany({ where: { id: order.merchantId, status: { in: ["APPROVED", "PAYMENT_VERIFIED", "DEVICE_ASSIGNED"] } }, data: { status: "ACTIVATED" } });
      await audit(tx, actor, { action: "device.activate", entityType: "SalesOrder", entityId: orderId, after: { terminalId, activatedAt } });
      const event = await accrueSalesCommission(tx, orderId, actor);
      await notifyUser(tx, order.agent.userId, "merchant.activated", { merchant: order.merchant.businessName, product: order.product.name, terminalId }, "/agent/merchants");
      // Transactions that arrived before activation for this terminal can now be matched.
      await enqueueJob(tx, "transactions.rematch", { terminalId }, { dedupeKey: `rematch:${terminalId}:${Date.now()}` });
      return { commissionEventId: event?.id ?? null };
    });
  } catch (e) {
    if (isUniqueViolation(e, "terminalId")) throw duplicate("Terminal ID sudah digunakan perangkat lain.");
    if (isUniqueViolation(e)) throw duplicate("Perangkat ini sudah aktif di merchant lain.");
    throw e;
  }
}

export async function receiveDevices(actor: Actor, productId: string, serials: string[], opts: { isDemo?: boolean } = {}) {
  requirePermission(actor, "device.manage");
  const clean = [...new Set(serials.map((s) => s.trim().toUpperCase()).filter(Boolean))];
  if (!clean.length) throw invalid("Masukkan minimal satu nomor seri.");
  if (clean.some((s) => !/^[A-Z0-9-]{4,40}$/.test(s))) throw invalid("Format nomor seri tidak valid.");
  return withTx(async (tx) => {
    const product = await tx.product.findUnique({ where: { id: productId } });
    if (!product) throw notFound("Produk");
    const existing = await tx.device.findMany({ where: { serialNumber: { in: clean } }, select: { serialNumber: true } });
    const fresh = clean.filter((s) => !existing.some((e) => e.serialNumber === s));
    for (const serialNumber of fresh) {
      const d = await tx.device.create({ data: { serialNumber, productId, isDemo: !!opts.isDemo } });
      await tx.inventoryMovement.create({ data: { deviceId: d.id, type: "RECEIVED", toStatus: "IN_STOCK", actorId: actor.userId } });
    }
    await audit(tx, actor, { action: "device.receive", entityType: "Product", entityId: productId, after: { received: fresh.length, skippedDuplicates: existing.length } });
    return { received: fresh.length, duplicates: existing.map((e) => e.serialNumber) };
  });
}

export async function markDeviceFaulty(actor: Actor, deviceId: string, note: string) {
  requirePermission(actor, "device.manage");
  return withTx(async (tx) => {
    const d = await tx.device.findUnique({ where: { id: deviceId } });
    if (!d) throw notFound("Perangkat");
    if (d.status !== "IN_STOCK" && d.status !== "RETURNED") throw rule("Hanya perangkat di gudang yang dapat ditandai rusak.");
    await tx.device.update({ where: { id: deviceId }, data: { status: "FAULTY" } });
    await tx.inventoryMovement.create({ data: { deviceId, type: "MARKED_FAULTY", fromStatus: d.status, toStatus: "FAULTY", note, actorId: actor.userId } });
    await audit(tx, actor, { action: "device.faulty", entityType: "Device", entityId: deviceId, after: { note } });
  });
}

// ─────────────────────────────── Refund / suspension ───────────────────────────────

/** Refund an order: payment refunded, device returned, activation closed, sales commission reversed (clawback if needed). */
export async function refundOrder(actor: Actor, orderId: string, reason: string) {
  requirePermission(actor, "order.refund");
  if (reason.trim().length < 5) throw invalid("Alasan pengembalian dana wajib diisi.");
  return withTx(async (tx) => {
    const order = await tx.salesOrder.findUnique({ where: { id: orderId }, include: { device: true, activation: true } });
    if (!order) throw notFound("Pesanan");
    if (order.status === "REFUNDED" || order.status === "CANCELLED") throw rule("Pesanan sudah dibatalkan/dikembalikan.");
    const now = new Date();
    await tx.payment.updateMany({ where: { orderId, status: "VERIFIED" }, data: { status: "REFUNDED", refundedAt: now, refundReason: reason } });
    if (order.device) {
      await tx.device.update({ where: { id: order.device.id }, data: { status: "RETURNED", orderId: null, merchantId: null, terminalId: null } });
      await tx.inventoryMovement.create({ data: { deviceId: order.device.id, type: "RETURNED", fromStatus: order.device.status, toStatus: "RETURNED", orderId, merchantId: order.merchantId, actorId: actor.userId, note: reason } });
    }
    if (order.activation && !order.activation.deactivatedAt) await tx.activation.update({ where: { id: order.activation.id }, data: { deactivatedAt: now } });
    await tx.salesOrder.update({ where: { id: orderId }, data: { status: "REFUNDED", statusReason: reason } });
    const otherLive = await tx.salesOrder.count({ where: { merchantId: order.merchantId, id: { not: orderId }, status: { in: ["ACTIVATED", "DEVICE_ASSIGNED", "PAYMENT_VERIFIED", "AWAITING_PAYMENT"] } } });
    if (!otherLive) await tx.merchant.update({ where: { id: order.merchantId }, data: { status: "REFUNDED", statusReason: reason } });
    const event = await tx.commissionEvent.findUnique({ where: { eventRef: `SALE:${orderId}` } });
    if (event) await reverseCommissionEvent(tx, event.id, `Pengembalian dana: ${reason}`, actor);
    await audit(tx, actor, { action: "order.refund", entityType: "SalesOrder", entityId: orderId, before: { status: order.status }, after: { status: "REFUNDED", reason } });
  });
}

export async function setMerchantSuspended(actor: Actor, merchantId: string, suspended: boolean, reason: string) {
  requirePermission(actor, "merchant.suspend");
  if (reason.trim().length < 5) throw invalid("Alasan wajib diisi.");
  return withTx(async (tx) => {
    const m = await tx.merchant.findUnique({ where: { id: merchantId }, include: { orders: { orderBy: { createdAt: "desc" }, take: 1 } } });
    if (!m) throw notFound("Merchant");
    if (suspended && ["SUSPENDED", "REFUNDED", "CANCELLED"].includes(m.status)) throw rule("Merchant tidak dapat ditangguhkan pada status ini.");
    if (!suspended && m.status !== "SUSPENDED") throw rule("Merchant tidak dalam status ditangguhkan.");
    let restore: Prisma.MerchantUpdateInput["status"] = "APPROVED";
    if (!suspended) {
      const o = m.orders[0];
      const eligible = o ? await tx.commissionEvent.findFirst({ where: { sourceOrderId: o.id, status: { in: ["ELIGIBLE", "APPROVED", "PAYABLE", "PAID"] } } }) : null;
      restore = eligible ? "COMMISSION_ELIGIBLE" : o?.status === "ACTIVATED" ? "ACTIVATED" : o?.status === "DEVICE_ASSIGNED" ? "DEVICE_ASSIGNED" : o?.status === "PAYMENT_VERIFIED" ? "PAYMENT_VERIFIED" : "APPROVED";
    }
    await tx.merchant.update({ where: { id: merchantId }, data: { status: suspended ? "SUSPENDED" : restore, statusReason: reason } });
    await audit(tx, actor, { action: suspended ? "merchant.suspend" : "merchant.reinstate", entityType: "Merchant", entityId: merchantId, before: { status: m.status }, after: { reason } });
  });
}

/** Privileged attribution change. Not retroactive: past commissions keep their beneficiary. */
export async function changeAttribution(actor: Actor, merchantId: string, newAgentId: string, reason: string) {
  requirePermission(actor, "attribution.change");
  if (reason.trim().length < 10) throw invalid("Alasan wajib diisi (min. 10 karakter).");
  return withTx(async (tx) => {
    const current = await tx.merchantAttribution.findFirst({ where: { merchantId, effectiveTo: null } });
    if (!current) throw notFound("Atribusi merchant");
    if (current.agentId === newAgentId) throw rule("Merchant sudah diatribusikan ke agen ini.");
    const agent = await tx.agent.findUnique({ where: { id: newAgentId } });
    if (!agent || agent.status !== "ACTIVE") throw rule("Agen tujuan harus aktif.");
    const now = new Date();
    await tx.merchantAttribution.update({ where: { id: current.id }, data: { effectiveTo: now } });
    await tx.merchantAttribution.create({ data: { merchantId, agentId: newAgentId, effectiveFrom: now, reason, createdById: actor.userId, approvedById: actor.userId } });
    await audit(tx, actor, { action: "attribution.change", entityType: "Merchant", entityId: merchantId, before: { agentId: current.agentId }, after: { agentId: newAgentId, reason } });
  });
}

/** Creates a merchant-portal login. Returns a one-time temporary password to hand over securely. */
export async function createMerchantPortalUser(actor: Actor, merchantId: string, email: string) {
  requirePermission(actor, "merchant.review");
  const m = await prisma.merchant.findUnique({ where: { id: merchantId } });
  if (!m) throw notFound("Merchant");
  if (m.userId) throw rule("Merchant sudah memiliki akun portal.");
  const tempPassword = `Hj-${randomToken(9)}9`;
  const passwordHash = await hashPassword(tempPassword);
  try {
    await withTx(async (tx) => {
      const role = await tx.role.findUniqueOrThrow({ where: { key: "MERCHANT" } });
      const user = await tx.user.create({ data: { email: email.toLowerCase().trim(), name: m.ownerName, passwordHash, roles: { create: { roleId: role.id } } } });
      await tx.merchant.update({ where: { id: merchantId }, data: { userId: user.id } });
      await audit(tx, actor, { action: "merchant.portal_user.create", entityType: "Merchant", entityId: merchantId });
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw duplicate("Email sudah digunakan.");
    throw e;
  }
  return { tempPassword };
}

// ─────────────────────────────── Queries (object-level scoped) ───────────────────────────────

export async function getLeadDetail(actor: Actor, leadId: string) {
  const lead = await loadLeadForActor(prisma, actor, leadId);
  const full = await prisma.merchantLead.findUniqueOrThrow({
    where: { id: lead.id },
    include: {
      product: true, agent: { select: { id: true, agentCode: true, fullName: true } }, documents: { orderBy: { createdAt: "asc" } },
      merchant: { include: { orders: { include: { payments: true, device: true, activation: true, product: true }, orderBy: { createdAt: "asc" } } } },
    },
  });
  return full;
}

export function assertMerchantAccess(actor: Actor, merchant: { id: string; attributions?: { agentId: string; effectiveTo: Date | null }[] }) {
  if (actor.merchantId === merchant.id) return;
  if (actor.agentId && merchant.attributions?.some((a) => a.agentId === actor.agentId && a.effectiveTo === null)) return;
  if (!can(actor, "merchant.view")) throw new AppError("FORBIDDEN", "Anda tidak memiliki akses ke merchant ini.");
}

