import "server-only";
import type { FileClassification, FilePurpose } from "@prisma/client";
import { prisma, type Db } from "../db";
import { randomToken, sha256Hex } from "../crypto";
import { storage } from "./index";
import { scanBuffer } from "./scan";
import { validateFile, type FileKind } from "./validate";
import { invalid, forbidden, notFound } from "../errors";
import { can, type Actor } from "../rbac";
import { audit } from "../audit";

const CLASSIFICATION: Record<FilePurpose, FileClassification> = {
  KYC_ID_CARD: "RESTRICTED",
  KYC_SELFIE: "RESTRICTED",
  MERCHANT_DOCUMENT: "RESTRICTED",
  PAYMENT_PROOF: "INTERNAL",
  PAYOUT_PROOF: "INTERNAL",
  IMPORT_SOURCE: "INTERNAL",
  IMPORT_ERROR_REPORT: "INTERNAL",
  PRODUCT_IMAGE: "PUBLIC",
};

export interface UploadInput {
  buffer: Buffer;
  filename: string;
  purpose: FilePurpose;
  allowed: FileKind[];
  uploadedById: string | null;
  ownerAgentId?: string | null;
  maxBytes?: number;
  retentionUntil?: Date;
}

/** Validate (magic bytes), scan, store with a random key, and record metadata. */
export async function storeUpload(input: UploadInput, db: Db = prisma) {
  let v;
  try {
    v = validateFile(input.buffer, input.filename, input.allowed, input.maxBytes);
  } catch (e) {
    throw invalid((e as Error).message);
  }
  const scan = await scanBuffer(input.buffer);
  if (scan === "INFECTED") throw invalid("Berkas terdeteksi mengandung malware dan ditolak.");
  const key = `${input.purpose.toLowerCase()}/${new Date().toISOString().slice(0, 7)}/${randomToken(18)}${v.ext}`;
  await storage().put(key, input.buffer, v.mime);
  return db.storedFile.create({
    data: {
      purpose: input.purpose,
      classification: CLASSIFICATION[input.purpose],
      storageKey: key,
      originalName: input.filename.replace(/[^\w.\- ]/g, "_").slice(0, 120),
      mimeType: v.mime,
      sizeBytes: input.buffer.length,
      sha256: sha256Hex(input.buffer),
      scanStatus: scan,
      uploadedById: input.uploadedById,
      ownerAgentId: input.ownerAgentId ?? null,
      retentionUntil: input.retentionUntil,
    },
  });
}

export async function fileFromFormData(form: FormData, field: string): Promise<{ buffer: Buffer; filename: string } | null> {
  const f = form.get(field);
  if (!f || typeof f === "string" || f.size === 0) return null;
  return { buffer: Buffer.from(await f.arrayBuffer()), filename: f.name };
}

/**
 * Object-level authorization for file downloads.
 * RESTRICTED (KYC, merchant docs): reviewers only (kyc.review / merchant.review); agents may view
 * merchant documents they uploaded themselves. KYC files are never re-served to agents.
 */
export async function readFileAuthorized(actor: Actor, fileId: string) {
  const file = await prisma.storedFile.findUnique({ where: { id: fileId } });
  if (!file || file.deletedAt) throw notFound("Berkas");
  const isOwnerAgent = !!actor.agentId && file.ownerAgentId === actor.agentId;
  let allowed = false;
  switch (file.purpose) {
    case "KYC_ID_CARD":
    case "KYC_SELFIE":
      allowed = can(actor, "kyc.review");
      break;
    case "MERCHANT_DOCUMENT":
      allowed = can(actor, "merchant.review") || can(actor, "merchant.view") || isOwnerAgent;
      break;
    case "PAYMENT_PROOF":
      allowed = can(actor, "payment.verify") || can(actor, "order.view") || isOwnerAgent;
      break;
    case "PAYOUT_PROOF":
      allowed = can(actor, "payout.record") || can(actor, "payout.confirm") || can(actor, "withdrawal.review");
      break;
    case "IMPORT_SOURCE":
    case "IMPORT_ERROR_REPORT":
      allowed = can(actor, "import.manage");
      break;
    case "PRODUCT_IMAGE":
      allowed = true;
  }
  if (!allowed) throw forbidden();
  if (file.classification === "RESTRICTED") {
    await audit(prisma, actor, { action: "file.view", entityType: "StoredFile", entityId: file.id, metadata: { purpose: file.purpose } });
  }
  const body = await storage().get(file.storageKey);
  return { file, body };
}
