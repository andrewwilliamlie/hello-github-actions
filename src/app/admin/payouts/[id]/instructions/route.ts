import { NextResponse } from "next/server";
import { requireActor } from "@/server/auth/session";
import { exportPayoutInstructions } from "@/server/modules/withdrawals";
import { AppError } from "@/server/errors";

/** Manual bank transfer instruction file (account numbers decrypted for this download only; audited). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireActor();
    const { id } = await params;
    const f = await exportPayoutInstructions(actor, id);
    return new NextResponse(f.content, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${f.fileName}"`, "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof AppError ? e.message : "Internal error" }, { status: e instanceof AppError ? e.status : 500 });
  }
}
