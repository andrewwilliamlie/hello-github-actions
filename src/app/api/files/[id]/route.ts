import { NextResponse } from "next/server";
import { requireActor } from "@/server/auth/session";
import { readFileAuthorized } from "@/server/storage/files";
import { AppError } from "@/server/errors";

/** Authorized file download (object-level checks in readFileAuthorized; restricted access audited). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireActor();
    const { id } = await params;
    const { file, body } = await readFileAuthorized(actor, id);
    const inline = file.mimeType.startsWith("image/") || file.mimeType === "application/pdf";
    return new NextResponse(new Uint8Array(body), {
      headers: {
        "Content-Type": file.mimeType,
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${file.originalName.replace(/"/g, "")}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
      },
    });
  } catch (e) {
    const status = e instanceof AppError ? e.status : 500;
    return NextResponse.json({ error: e instanceof AppError ? e.message : "Internal error" }, { status });
  }
}
