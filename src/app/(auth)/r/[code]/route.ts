import { NextResponse } from "next/server";

/** Permanent recruitment link: /r/{referralCode} → registration with the code prefilled. */
export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const clean = code.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 16);
  return NextResponse.redirect(new URL(`/register?ref=${clean}`, req.url));
}
