import { NextResponse } from "next/server";
import type { ImportType } from "@prisma/client";
import { IMPORT_TEMPLATES } from "@/server/modules/imports";

export async function GET(req: Request) {
  const type = (new URL(req.url).searchParams.get("type") ?? "TRANSACTIONS") as ImportType;
  const body = IMPORT_TEMPLATES[type];
  if (!body) return NextResponse.json({ error: "Unknown type" }, { status: 404 });
  return new NextResponse(body, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="template-${type.toLowerCase()}.csv"` } });
}
