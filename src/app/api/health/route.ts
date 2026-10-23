import { NextResponse } from "next/server";
import { prisma } from "@/server/db";

/** Liveness/readiness: app is up and the database answers. No sensitive details exposed. */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ status: "degraded" }, { status: 503 });
  }
}
