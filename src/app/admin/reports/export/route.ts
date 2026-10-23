import { NextResponse } from "next/server";
import { requireActor } from "@/server/auth/session";
import { exportRows, toCsv, toXlsx, type ExportKind } from "@/server/modules/reports";
import { audit } from "@/server/audit";
import { prisma } from "@/server/db";
import { parseRange } from "@/lib/range";
import { AppError } from "@/server/errors";

const KINDS: ExportKind[] = ["agents", "merchants", "commissions", "transactions", "withdrawals"];

export async function GET(req: Request) {
  try {
    const actor = await requireActor();
    const sp = new URL(req.url).searchParams;
    const kind = sp.get("kind") as ExportKind;
    if (!KINDS.includes(kind)) throw new AppError("VALIDATION", "Jenis ekspor tidak dikenal.");
    const range = parseRange({ from: sp.get("from") ?? undefined, to: sp.get("to") ?? undefined });
    const { columns, rows } = await exportRows(actor, kind, range);
    await audit(prisma, actor, { action: "report.export", entityType: "Report", entityId: kind, metadata: { ...range, rows: rows.length, format: sp.get("format") } });
    const name = `hausjo-${kind}-${range.from}_${range.to}`;
    if (sp.get("format") === "xlsx") {
      const buf = await toXlsx(kind, columns, rows);
      return new NextResponse(new Uint8Array(buf), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${name}.xlsx"`, "Cache-Control": "no-store" } });
    }
    return new NextResponse("﻿" + toCsv(columns, rows), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}.csv"`, "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof AppError ? e.message : "Internal error" }, { status: e instanceof AppError ? e.status : 500 });
  }
}
