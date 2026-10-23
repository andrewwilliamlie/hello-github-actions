import { describe, expect, it } from "vitest";
import { assertBalanced, balanceEffect, cr, dr } from "@/server/ledger";
import { normalizeTransaction, parseTimestamp } from "@/server/modules/transactions";
import { sniffKind, validateFile } from "@/server/storage/validate";
import { percentToBps } from "@/server/modules/rules";
import { redact } from "@/server/redact";
import { PNG_1PX, PDF_MIN } from "../support/files";

describe("ledger math", () => {
  it("liability accounts are credit-normal, receivable is debit-normal", () => {
    expect(balanceEffect(cr("AGENT_PAYABLE", 100n, { agentId: "a" }))).toBe(100n);
    expect(balanceEffect(dr("AGENT_PAYABLE", 100n, { agentId: "a" }))).toBe(-100n);
    expect(balanceEffect(dr("AGENT_RECEIVABLE", 100n, { agentId: "a" }))).toBe(100n);
    expect(balanceEffect(cr("AGENT_RECEIVABLE", 100n, { agentId: "a" }))).toBe(-100n);
  });
  it("rejects unbalanced journals, non-positive lines and agent lines without an agent", () => {
    expect(() => assertBalanced([dr("COMMISSION_EXPENSE", 100n), cr("AGENT_PENDING", 99n, { agentId: "a" })])).toThrow(/Unbalanced/);
    expect(() => assertBalanced([dr("COMMISSION_EXPENSE", 0n), cr("AGENT_PENDING", 0n, { agentId: "a" })])).toThrow();
    expect(() => assertBalanced([dr("COMMISSION_EXPENSE", 1n), cr("AGENT_PENDING", 1n)])).toThrow(/agentId/);
    expect(() => assertBalanced([dr("COMMISSION_EXPENSE", 100n), cr("AGENT_PENDING", 100n, { agentId: "a" })])).not.toThrow();
  });
});

describe("transaction normalization", () => {
  it("maps status synonyms and defaults timestamps to WIB", () => {
    const r = normalizeTransaction({ externalId: "T1", terminalId: "tid0001", status: "approved", amount: "150000", occurredAt: "2026-10-20 14:33:00" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.status).toBe("SUCCESS");
    expect(r.value.terminalId).toBe("TID0001");
    expect(r.value.occurredAt.toISOString()).toBe("2026-10-20T07:33:00.000Z");
    expect(r.value.type).toBe("PURCHASE");
  });
  it("respects explicit offsets and DD/MM/YYYY", () => {
    expect(parseTimestamp("2026-10-20T14:33:00Z")?.toISOString()).toBe("2026-10-20T14:33:00.000Z");
    expect(parseTimestamp("20/10/2026 14:33")?.toISOString()).toBe("2026-10-20T07:33:00.000Z");
  });
  it("flags test transactions and rejects invalid rows with reasons", () => {
    const t = normalizeTransaction({ externalId: "T2", terminalId: "TID0001", status: "SUCCESS", amount: 1, occurredAt: "2026-10-20 10:00", isTest: "yes" });
    expect(t.ok && t.value.isTest).toBe(true);
    const bad = normalizeTransaction({ externalId: "T3", terminalId: "x", status: "??", amount: 1.5, occurredAt: "yesterday" });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.errors.length).toBe(4);
  });
  it("rejects future timestamps", () => {
    const r = normalizeTransaction({ externalId: "T4", terminalId: "TID0001", status: "SUCCESS", amount: 1, occurredAt: new Date(Date.now() + 3600_000).toISOString() });
    expect(r.ok).toBe(false);
  });
});

describe("upload validation (magic bytes)", () => {
  it("detects real file types regardless of name", () => {
    expect(sniffKind(PNG_1PX)).toBe("png");
    expect(sniffKind(PDF_MIN)).toBe("pdf");
    expect(sniffKind(Buffer.from("a,b\n1,2\n"))).toBe("csv");
  });
  it("rejects markup, extension mismatch, disallowed kinds and oversize files", () => {
    expect(sniffKind(Buffer.from("<svg onload=alert(1)></svg>"))).toBeNull();
    expect(() => validateFile(PNG_1PX, "ktp.pdf", ["png", "pdf"])).toThrow(/Ekstensi/);
    expect(() => validateFile(PDF_MIN, "doc.pdf", ["png"])).toThrow(/tidak diizinkan/);
    expect(() => validateFile(Buffer.alloc(10, 1), "x.png", ["png"], 5)).toThrow(/Ukuran/);
    expect(validateFile(PNG_1PX, "KTP.PNG", ["png"]).mime).toBe("image/png");
  });
});

describe("misc", () => {
  it("converts percentages to basis points exactly", () => {
    expect(percentToBps("10")).toBe(1000);
    expect(percentToBps("2.5")).toBe(250);
    expect(percentToBps("0,75")).toBe(75);
    expect(() => percentToBps("100.01")).toThrow();
    expect(() => percentToBps("1.234")).toThrow();
  });
  it("redacts sensitive keys but keeps safe metadata", () => {
    const r = redact({ password: "x", accountNumber: "123", accountNumberLast4: "0123", nested: { otpCode: "1", idNumberHash: "h" }, amount: 5n });
    expect(r).toEqual({ password: "[REDACTED]", accountNumber: "[REDACTED]", accountNumberLast4: "0123", nested: { otpCode: "[REDACTED]", idNumberHash: "h" }, amount: "5" });
  });
});
