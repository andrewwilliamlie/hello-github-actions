import "server-only";
import Papa from "papaparse";
import type { ImportRowStatus, ImportType, Prisma } from "@prisma/client";
import { prisma } from "../db";
import { audit } from "../audit";
import { storage } from "../storage";
import { storeUpload } from "../storage/files";
import { sniffKind } from "../storage/validate";
import { requirePermission, type Actor } from "../rbac";
import { invalid, notFound, rule } from "../errors";
import { ingestSettlements, ingestTransactions, normalizeTransaction, settlementSchema } from "./transactions";
import { createLead, dedupeKeyFor, leadSchema } from "./merchants";
import { receiveDevices } from "./merchants";

const MAX_ROWS = 50_000;

/** Column aliases (lower-case, spaces/underscores ignored) → canonical field. */
const COLUMNS: Record<ImportType, Record<string, string[]>> = {
  TRANSACTIONS: {
    externalId: ["transactionid", "trxid", "txnid", "externalid", "id"],
    terminalId: ["terminalid", "tid"],
    processorMid: ["merchantid", "mid", "processormid"],
    type: ["type", "transactiontype", "trxtype"],
    status: ["status", "responsestatus"],
    amount: ["amount", "nominal", "grossamount"],
    occurredAt: ["timestamp", "transactiontime", "datetime", "occurredat", "trxdate"],
    settlementRef: ["settlementref", "settlementreference", "batchref", "settlementid"],
    isTest: ["istest", "test"],
  },
  SETTLEMENTS: {
    settlementRef: ["settlementref", "settlementreference", "settlementid", "batchref"],
    settlementDate: ["settlementdate", "date"],
    expectedCount: ["txncount", "transactioncount", "count", "expectedcount"],
    expectedAmount: ["grossamount", "amount", "totalamount", "expectedamount"],
  },
  MERCHANT_LEADS: {
    agentCode: ["agentcode", "agent"],
    businessName: ["businessname", "merchantname", "namausaha"],
    ownerName: ["ownername", "pemilik", "owner"],
    phone: ["phone", "nohp", "telepon", "mobile"],
    email: ["email"],
    businessType: ["businesstype", "jenisusaha", "category"],
    addressLine: ["address", "alamat", "addressline"],
    city: ["city", "kota"],
    province: ["province", "provinsi"],
    postalCode: ["postalcode", "kodepos"],
    productSku: ["productsku", "sku", "product"],
    notes: ["notes", "catatan"],
  },
  DEVICES: {
    serialNumber: ["serialnumber", "serial", "sn"],
    productSku: ["productsku", "sku", "product"],
  },
};

const norm = (h: string) => h.toLowerCase().replace(/[\s_\-.]/g, "");

function mapRow(type: ImportType, row: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  const keys = Object.keys(row);
  for (const [field, aliases] of Object.entries(COLUMNS[type])) {
    const k = keys.find((key) => aliases.includes(norm(key)));
    if (k !== undefined && row[k] !== null && row[k] !== undefined) {
      const v = row[k];
      out[field] = v instanceof Date ? v.toISOString() : typeof v === "object" ? String((v as { text?: string; result?: unknown }).text ?? (v as { result?: unknown }).result ?? "") : String(v).trim();
    }
  }
  return out;
}

async function parseFile(buffer: Buffer): Promise<Record<string, unknown>[]> {
  const kind = sniffKind(buffer);
  if (kind === "xlsx") {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    const ws = wb.worksheets[0];
    if (!ws) return [];
    const headers: string[] = [];
    ws.getRow(1).eachCell({ includeEmpty: true }, (cell, col) => (headers[col] = String(cell.text ?? "").trim()));
    const rows: Record<string, unknown>[] = [];
    ws.eachRow({ includeEmpty: false }, (row, n) => {
      if (n === 1) return;
      const obj: Record<string, unknown> = {};
      row.eachCell({ includeEmpty: true }, (cell, col) => {
        if (headers[col]) obj[headers[col]] = cell.value instanceof Date ? cell.value : cell.text;
      });
      rows.push(obj);
    });
    return rows;
  }
  if (kind === "csv") {
    const text = buffer.toString("utf8").replace(/^﻿/, "");
    const res = Papa.parse<Record<string, unknown>>(text, { header: true, skipEmptyLines: "greedy", transformHeader: (h) => h.trim() });
    if (res.errors.length && !res.data.length) throw invalid(`CSV tidak dapat dibaca: ${res.errors[0]?.message}`);
    return res.data;
  }
  throw invalid("Format berkas harus CSV atau XLSX.");
}

interface RowCheck { status: ImportRowStatus; normalized?: Record<string, unknown>; errors: string[]; key?: string }

async function validateRow(type: ImportType, source: string | null, m: Record<string, string>): Promise<RowCheck> {
  if (type === "TRANSACTIONS") {
    const n = normalizeTransaction(m);
    if (!n.ok) return { status: "INVALID", errors: n.errors };
    const key = `${source}:${n.value.externalId}`;
    const exists = await prisma.transaction.findUnique({ where: { idempotencyKey: key }, select: { status: true } });
    const normalized = { ...n.value, amount: n.value.amount.toString(), occurredAt: n.value.occurredAt.toISOString() };
    if (exists && exists.status === n.value.status) return { status: "DUPLICATE_EXISTING", normalized, errors: [], key };
    return { status: "VALID", normalized, errors: [], key };
  }
  if (type === "SETTLEMENTS") {
    const p = settlementSchema.safeParse(m);
    if (!p.success) return { status: "INVALID", errors: p.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) };
    const key = `${source}:${p.data.settlementRef}`;
    const exists = await prisma.settlement.findUnique({ where: { source_settlementRef: { source: source!, settlementRef: p.data.settlementRef } } });
    const normalized = { ...m, settlementRef: p.data.settlementRef };
    return { status: exists ? "DUPLICATE_EXISTING" : "VALID", normalized, errors: [], key };
  }
  if (type === "MERCHANT_LEADS") {
    const errors: string[] = [];
    const agent = m.agentCode ? await prisma.agent.findUnique({ where: { agentCode: m.agentCode.toUpperCase() } }) : null;
    if (!agent) errors.push("agentCode tidak ditemukan");
    else if (agent.status !== "ACTIVE") errors.push("agen tidak aktif");
    const product = m.productSku ? await prisma.product.findUnique({ where: { sku: m.productSku.toUpperCase() } }) : null;
    if (!product) errors.push("productSku tidak ditemukan");
    const p = leadSchema.safeParse({ ...m, productId: product?.id ?? "" });
    if (!p.success) errors.push(...p.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`));
    if (errors.length || !p.success) return { status: "INVALID", errors };
    const key = dedupeKeyFor(p.data.phone, p.data.businessName);
    const exists = (await prisma.merchant.findUnique({ where: { dedupeKey: key } })) || (await prisma.merchantLead.findFirst({ where: { dedupeKey: key, status: { notIn: ["REJECTED", "CANCELLED"] }, deletedAt: null } }));
    return { status: exists ? "DUPLICATE_EXISTING" : "VALID", normalized: { ...m, agentId: agent!.id, productId: product!.id }, errors: [], key };
  }
  // DEVICES
  const errors: string[] = [];
  const serial = (m.serialNumber ?? "").toUpperCase();
  if (!/^[A-Z0-9-]{4,40}$/.test(serial)) errors.push("serialNumber tidak valid");
  const product = m.productSku ? await prisma.product.findUnique({ where: { sku: m.productSku.toUpperCase() } }) : null;
  if (!product) errors.push("productSku tidak ditemukan");
  if (errors.length) return { status: "INVALID", errors };
  const exists = await prisma.device.findUnique({ where: { serialNumber: serial } });
  return { status: exists ? "DUPLICATE_EXISTING" : "VALID", normalized: { serialNumber: serial, productId: product!.id }, errors: [], key: serial };
}

/** Upload + parse + validate + dedupe → preview (nothing is applied yet). */
export async function createImport(actor: Actor, input: { type: ImportType; source?: string; file: { buffer: Buffer; filename: string } }) {
  requirePermission(actor, "import.manage");
  const source = input.type === "TRANSACTIONS" || input.type === "SETTLEMENTS" ? (input.source ?? "").trim().toUpperCase() : null;
  if (source !== null && !/^[A-Z0-9_]{2,40}$/.test(source)) throw invalid("Kode sumber/prosesor wajib diisi (huruf besar, angka, _).");
  const stored = await storeUpload({ ...input.file, purpose: "IMPORT_SOURCE", allowed: ["csv", "xlsx"], uploadedById: actor.userId, maxBytes: 20 * 1024 * 1024 });
  const rows = await parseFile(input.file.buffer);
  if (!rows.length) throw invalid("Berkas tidak berisi baris data.");
  if (rows.length > MAX_ROWS) throw invalid(`Maksimal ${MAX_ROWS} baris per impor.`);
  const previous = await prisma.transactionImport.findFirst({ where: { sha256: stored.sha256, type: input.type, status: "COMMITTED" }, orderBy: { createdAt: "desc" } });
  const imp = await prisma.transactionImport.create({
    data: { type: input.type, source, fileId: stored.id, fileName: stored.originalName, sha256: stored.sha256, createdById: actor.userId!, previousImportId: previous?.id, totalRows: rows.length },
  });
  const seen = new Set<string>();
  const counts = { valid: 0, invalid: 0, duplicate: 0 };
  const batch: Prisma.ImportRowCreateManyInput[] = [];
  for (let i = 0; i < rows.length; i++) {
    const mapped = mapRow(input.type, rows[i]);
    let check = await validateRow(input.type, source, mapped);
    const key = check.key;
    if (key && check.status === "VALID") {
      if (seen.has(key)) check = { ...check, status: "DUPLICATE_IN_FILE", errors: ["baris duplikat dalam berkas"] };
      seen.add(key);
    }
    if (check.status === "VALID") counts.valid++;
    else if (check.status === "INVALID") counts.invalid++;
    else counts.duplicate++;
    batch.push({ importId: imp.id, rowNumber: i + 2, raw: rows[i] as Prisma.InputJsonValue, normalized: (check.normalized ?? undefined) as Prisma.InputJsonValue | undefined, status: check.status, errors: check.errors });
    if (batch.length >= 1000) await prisma.importRow.createMany({ data: batch.splice(0) });
  }
  if (batch.length) await prisma.importRow.createMany({ data: batch });
  const updated = await prisma.transactionImport.update({ where: { id: imp.id }, data: { validRows: counts.valid, invalidRows: counts.invalid, duplicateRows: counts.duplicate } });
  await audit(prisma, actor, { action: "import.create", entityType: "TransactionImport", entityId: imp.id, after: { type: input.type, rows: rows.length, ...counts, reimportOf: previous?.id ?? null } });
  return updated;
}

/**
 * Apply VALID rows. Safe to retry after a failure: every row is applied through idempotent
 * ingestion (unique keys), so already-applied rows become duplicates rather than double credits.
 */
export async function commitImport(actor: Actor, importId: string) {
  requirePermission(actor, "import.manage");
  const claimed = await prisma.transactionImport.updateMany({ where: { id: importId, status: { in: ["VALIDATED", "FAILED"] } }, data: { status: "COMMITTING" } });
  if (claimed.count !== 1) throw rule("Impor sedang diproses atau sudah diterapkan.");
  const imp = await prisma.transactionImport.findUniqueOrThrow({ where: { id: importId } });
  try {
    const rows = await prisma.importRow.findMany({ where: { importId, status: "VALID" }, orderBy: { rowNumber: "asc" } });
    let imported = 0;
    for (const row of rows) {
      const n = row.normalized as Record<string, string>;
      let status: ImportRowStatus = "IMPORTED";
      let errors: string[] = [];
      let entityId: string | undefined;
      try {
        if (imp.type === "TRANSACTIONS") {
          const [r] = await ingestTransactions(actor, imp.source!, [n], "IMPORT", { importId });
          status = r.result === "CREATED" || r.result === "UPDATED" ? "IMPORTED" : r.result === "DUPLICATE" ? "DUPLICATE_EXISTING" : "INVALID";
          errors = r.errors ?? (r.result === "CONFLICT" ? ["konflik dengan data yang ada — lihat antrean pengecualian"] : []);
          entityId = r.transactionId;
        } else if (imp.type === "SETTLEMENTS") {
          const [r] = await ingestSettlements(actor, imp.source!, [n], { importId });
          status = r.result === "CREATED" ? "IMPORTED" : r.result === "DUPLICATE" ? "DUPLICATE_EXISTING" : "INVALID";
          errors = r.errors ?? (r.result === "CONFLICT" ? ["total settlement berbeda dari laporan sebelumnya"] : []);
        } else if (imp.type === "MERCHANT_LEADS") {
          const lead = await createLead(actor, n as never, { importRowId: row.id, agentIdOverride: n.agentId });
          entityId = lead.id;
        } else {
          const r = await receiveDevices(actor, n.productId, [n.serialNumber]);
          status = r.received ? "IMPORTED" : "DUPLICATE_EXISTING";
        }
      } catch (e) {
        const msg = (e as Error).message;
        status = /sudah|duplikat|already/i.test(msg) ? "DUPLICATE_EXISTING" : "INVALID";
        errors = [msg];
      }
      if (status === "IMPORTED") imported++;
      await prisma.importRow.update({ where: { id: row.id }, data: { status, errors, entityId } });
    }
    const agg = await prisma.importRow.groupBy({ by: ["status"], where: { importId }, _count: true });
    const c = (s: ImportRowStatus) => agg.find((a) => a.status === s)?._count ?? 0;
    const report = await buildErrorReport(importId);
    const reportFile = report ? await storeUpload({ buffer: Buffer.from(report, "utf8"), filename: `import-${importId}-errors.csv`, purpose: "IMPORT_ERROR_REPORT", allowed: ["csv"], uploadedById: actor.userId }) : null;
    const done = await prisma.transactionImport.update({
      where: { id: importId },
      data: { status: "COMMITTED", committedAt: new Date(), importedRows: c("IMPORTED"), invalidRows: c("INVALID"), duplicateRows: c("DUPLICATE_EXISTING") + c("DUPLICATE_IN_FILE"), errorReportFileId: reportFile?.id },
    });
    await audit(prisma, actor, { action: "import.commit", entityType: "TransactionImport", entityId: importId, after: { imported } });
    return done;
  } catch (e) {
    await prisma.transactionImport.update({ where: { id: importId }, data: { status: "FAILED" } });
    throw e;
  }
}

export async function cancelImport(actor: Actor, importId: string) {
  requirePermission(actor, "import.manage");
  const r = await prisma.transactionImport.updateMany({ where: { id: importId, status: "VALIDATED" }, data: { status: "CANCELLED" } });
  if (r.count !== 1) throw rule("Hanya impor yang belum diterapkan yang dapat dibatalkan.");
  await audit(prisma, actor, { action: "import.cancel", entityType: "TransactionImport", entityId: importId });
}

export async function buildErrorReport(importId: string): Promise<string | null> {
  const rows = await prisma.importRow.findMany({ where: { importId, status: { in: ["INVALID", "DUPLICATE_IN_FILE", "DUPLICATE_EXISTING"] } }, orderBy: { rowNumber: "asc" } });
  if (!rows.length) return null;
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return ["row,status,errors,raw", ...rows.map((r) => [r.rowNumber, r.status, esc((r.errors as string[]).join("; ")), esc(JSON.stringify(r.raw))].join(","))].join("\n");
}

export async function importErrorReportCsv(actor: Actor, importId: string) {
  requirePermission(actor, "import.manage");
  const imp = await prisma.transactionImport.findUnique({ where: { id: importId } });
  if (!imp) throw notFound("Impor");
  if (imp.errorReportFileId) {
    const f = await prisma.storedFile.findUniqueOrThrow({ where: { id: imp.errorReportFileId } });
    return (await storage().get(f.storageKey)).toString("utf8");
  }
  return (await buildErrorReport(importId)) ?? "row,status,errors,raw\n";
}

export const IMPORT_TEMPLATES: Record<ImportType, string> = {
  TRANSACTIONS: "transaction_id,terminal_id,merchant_id,type,status,amount,timestamp,settlement_ref,is_test\nTRX-0001,TID00001,MID001,PURCHASE,SUCCESS,150000,2026-10-20 14:33:00,STL-20261020-01,false\n",
  SETTLEMENTS: "settlement_ref,settlement_date,txn_count,gross_amount\nSTL-20261020-01,2026-10-20,1,150000\n",
  MERCHANT_LEADS: "agent_code,business_name,owner_name,phone,email,business_type,address,city,province,postal_code,product_sku,notes\nHJA-000001,Warung Contoh,Budi,081234567890,,Warung,Jl. Contoh No. 1,Bandung,Jawa Barat,40111,A920PRO,\n",
  DEVICES: "serial_number,product_sku\nSN-A920-0001,A920PRO\n",
};
