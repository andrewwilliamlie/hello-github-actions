import { NextResponse } from "next/server";
import { routes, match, authenticateApiKey, receiveWebhook } from "@/server/api/router";
import { assertSameOrigin, errorResponse, json, readJson } from "@/server/api/http";
import { requireActor } from "@/server/auth/session";
import { rateLimit } from "@/server/auth/rate-limit";
import { openApiSpec } from "@/server/api/openapi";
import type { Actor } from "@/server/rbac";

const ANONYMOUS: Actor = { kind: "user", userId: null, roles: [] };
import { AppError } from "@/server/errors";

async function handle(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  try {
    const { path } = await params;
    const p = "/" + path.join("/");
    if (req.method === "GET" && p === "/openapi.json") return NextResponse.json(openApiSpec());
    const m = match(req.method, p);
    if (!m) {
      const exists = routes.some((r) => match(r.method, p)?.route === r);
      return json({ error: { code: exists ? "METHOD_NOT_ALLOWED" : "NOT_FOUND", message: "Route not found" } }, exists ? 405 : 404);
    }
    const { route } = m;
    if (route.auth === "webhook") {
      const raw = await req.text();
      const r = await receiveWebhook({ apiKey: req.headers.get("x-api-key"), timestamp: req.headers.get("x-hausjo-timestamp"), signature: req.headers.get("x-hausjo-signature"), eventId: req.headers.get("x-hausjo-event-id") }, raw);
      return json(r, r.duplicate ? 200 : 202);
    }
    let actor: Actor;
    if (route.auth === "public") {
      const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
      await rateLimit(`api:public:${ip}`, 60, 60);
      actor = ANONYMOUS; // never the system actor: public handlers get no permissions
    } else if (route.auth === "apiKey") {
      actor = await authenticateApiKey(req.headers.get("x-api-key"));
    } else {
      assertSameOrigin(req);
      actor = await requireActor();
    }
    let cached: Record<string, unknown> | null = null;
    const data = await route.handler({ req, params: m.params, actor, query: new URL(req.url).searchParams, body: async () => (cached ??= await readJson<Record<string, unknown>>(req)) });
    return json(data ?? { ok: true }, route.status ?? 200);
  } catch (e) {
    if (e instanceof AppError && e.code === "RATE_LIMITED") return json({ error: { code: e.code, message: e.message } }, 429);
    return errorResponse(e);
  }
}

export { handle as GET, handle as POST, handle as PATCH };
