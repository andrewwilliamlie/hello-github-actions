import { NextResponse } from "next/server";
import { requireActor } from "@/server/auth/session";
import { agentStatement } from "@/server/modules/withdrawals";
import { toCsv } from "@/server/modules/reports";
import { startOfJakartaDay } from "@/lib/time";
import { AppError } from "@/server/errors";

/** Agent statement (ledger entries on own accounts) as CSV for a month (YYYY-MM). */
export async function GET(req: Request) {
  try {
    const actor = await requireActor();
    if (!actor.agentId) throw new AppError("FORBIDDEN", "Hanya agen.");
    const month = new URL(req.url).searchParams.get("month") ?? "";
    if (!/^\d{4}-\d{2}$/.test(month)) throw new AppError("VALIDATION", "Format bulan YYYY-MM.");
    const [y, m] = month.split("-").map(Number);
    const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
    const rows = await agentStatement(actor, actor.agentId, startOfJakartaDay(`${month}-01`), startOfJakartaDay(`${next}-01`));
    const csv = toCsv(
      ["timestamp", "journal", "kind", "description", "account", "direction", "amount_idr", "commission_event", "withdrawal"],
      rows.map((r) => [r.createdAt.toISOString(), r.journal.journalRef, r.journal.kind, r.journal.description, r.account, r.direction, r.amount.toString(), r.commissionEventId ?? "", r.withdrawalId ?? ""]),
    );
    return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="hausjo-statement-${month}.csv"`, "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof AppError ? e.message : "Internal error" }, { status: e instanceof AppError ? e.status : 500 });
  }
}
