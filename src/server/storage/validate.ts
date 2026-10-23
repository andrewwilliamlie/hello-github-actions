// File-type validation by magic bytes (never trust the client-provided MIME type or extension).
export type FileKind = "pdf" | "png" | "jpeg" | "webp" | "csv" | "xlsx";

export const KIND_MIME: Record<FileKind, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpeg: "image/jpeg",
  webp: "image/webp",
  csv: "text/csv",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

const EXT: Record<FileKind, string[]> = {
  pdf: [".pdf"], png: [".png"], jpeg: [".jpg", ".jpeg"], webp: [".webp"], csv: [".csv", ".txt"], xlsx: [".xlsx"],
};

export function sniffKind(buf: Buffer): FileKind | null {
  if (buf.length >= 5 && buf.subarray(0, 5).toString("latin1") === "%PDF-") return "pdf";
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";
  if (buf.length >= 12 && buf.subarray(0, 4).toString("latin1") === "RIFF" && buf.subarray(8, 12).toString("latin1") === "WEBP") return "webp";
  if (buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04) {
    // zip container — accept only if it looks like an OOXML workbook
    const head = buf.subarray(0, Math.min(buf.length, 4096)).toString("latin1");
    return head.includes("[Content_Types].xml") || head.includes("xl/") ? "xlsx" : null;
  }
  // CSV / plain text: printable UTF-8, no NUL bytes, no markup
  const sample = buf.subarray(0, Math.min(buf.length, 8192));
  if (sample.length > 0 && !sample.includes(0)) {
    const text = sample.toString("utf8");
    if (!/<\s*(script|html|svg|iframe)/i.test(text) && !text.includes("�")) return "csv";
  }
  return null;
}

export interface ValidatedFile { kind: FileKind; mime: string; ext: string }

export function validateFile(buf: Buffer, filename: string, allowed: FileKind[], maxBytes = 8 * 1024 * 1024): ValidatedFile {
  if (buf.length === 0) throw new Error("Berkas kosong.");
  if (buf.length > maxBytes) throw new Error(`Ukuran berkas melebihi ${Math.round(maxBytes / 1024 / 1024)} MB.`);
  const kind = sniffKind(buf);
  if (!kind || !allowed.includes(kind)) throw new Error(`Jenis berkas tidak diizinkan. Diizinkan: ${allowed.join(", ").toUpperCase()}.`);
  const ext = (filename.match(/\.[A-Za-z0-9]+$/)?.[0] ?? "").toLowerCase();
  if (!EXT[kind].includes(ext)) throw new Error("Ekstensi berkas tidak sesuai dengan isinya.");
  return { kind, mime: KIND_MIME[kind], ext };
}
