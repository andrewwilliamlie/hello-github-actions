import { NextResponse } from "next/server";
import { requireActor } from "@/server/auth/session";
import { importErrorReportCsv } from "@/server/modules/imports";
import { AppError } from "@/server/errors";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireActor();
    const { id } = await params;
    const csv = await importErrorReportCsv(actor, id);
    return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="import-${id}-errors.csv"` } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof AppError ? e.message : "Internal error" }, { status: e instanceof AppError ? e.status : 500 });
  }
}
