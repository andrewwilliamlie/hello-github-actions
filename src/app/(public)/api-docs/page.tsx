import { openApiSpec } from "@/server/api/openapi";
import { Badge } from "@/components/ui/badge";

export const metadata = { title: "Dokumentasi API" };

const METHOD_COLOR: Record<string, "info" | "success" | "warning"> = { get: "info", post: "success", patch: "warning" };

/** Human-readable rendering of the OpenAPI document (machine-readable at /api/v1/openapi.json). */
export default function ApiDocs() {
  const spec = openApiSpec();
  return (
    <main className="mx-auto max-w-5xl px-4 py-12">
      <h1 className="text-3xl font-extrabold text-navy-900">{spec.info.title}</h1>
      <p className="mt-2 text-muted-foreground">{spec.info.description}</p>
      <p className="mt-2 text-sm">OpenAPI 3.1: <a className="font-semibold underline" href="/api/v1/openapi.json">/api/v1/openapi.json</a> · Panduan integrasi: <code>docs/api.md</code></p>
      <section className="mt-8 rounded-2xl border bg-card p-5 text-sm">
        <h2 className="font-bold">Webhook signing</h2>
        <pre className="mt-2 overflow-x-auto rounded-lg bg-navy-950 p-4 text-xs text-sky-100">{`ts=$(date +%s)
body='{"type":"transactions","data":[{"externalId":"TRX-1","terminalId":"TID00001","status":"SUCCESS","amount":150000,"occurredAt":"2026-10-20T14:33:00+07:00","settlementRef":"STL-1"}]}'
sig="sha256=$(printf '%s.%s' "$ts" "$body" | openssl dgst -sha256 -hmac "$WEBHOOK_SECRET" -hex | sed 's/^.* //')"
curl -X POST $APP_URL/api/v1/webhooks/transactions \\
  -H "X-Api-Key: $API_KEY" -H "X-Hausjo-Timestamp: $ts" -H "X-Hausjo-Signature: $sig" \\
  -H "X-Hausjo-Event-Id: evt-$(uuidgen)" -H "Content-Type: application/json" -d "$body"`}</pre>
      </section>
      <div className="mt-8 divide-y rounded-2xl border bg-card">
        {Object.entries(spec.paths).flatMap(([path, ops]) =>
          Object.entries(ops).map(([method, op]) => {
            const o = op as { summary: string; tags: string[]; security: object[] };
            return (
              <div key={`${method} ${path}`} className="flex flex-wrap items-center gap-3 p-4 text-sm">
                <Badge variant={METHOD_COLOR[method] ?? "muted"} className="w-14 justify-center uppercase">{method}</Badge>
                <code className="font-mono font-semibold">{path}</code>
                <span className="text-muted-foreground">{o.summary}</span>
                <Badge variant="muted" className="ml-auto">{o.tags[0]}</Badge>
              </div>
            );
          }),
        )}
      </div>
    </main>
  );
}
