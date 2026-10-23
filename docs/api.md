# API & integration guide

* Base URL: `/api/v1` · OpenAPI 3.1: `/api/v1/openapi.json` (generated from the route table) · rendered: `/api-docs`
* Money values: whole Rupiah. Requests accept integers or digit strings; responses serialize as strings.
* Times: ISO 8601. Timestamps without an offset are interpreted as **Asia/Jakarta**.
* Errors: `{ "error": { "code", "message", "details" } }` with 401/403/404/409/422/429.

## Authentication
| Caller | Mechanism |
|---|---|
| Portal users (agent/admin/merchant) | `hj_session` cookie; state-changing requests must be same-origin (CSRF) |
| Payment processors / partners | `X-Api-Key: hj_<prefix>_<secret>` created in **Admin → Integrasi**; each key is bound to one `source` and scoped (`transactions:write`, `settlements:write`) |
| Webhooks | API key **and** HMAC signature (below) |

## Transaction ingestion
```http
POST /api/v1/transactions
X-Api-Key: hj_…
Content-Type: application/json

{ "transactions": [
  { "externalId": "TRX-0001", "terminalId": "TID00001", "processorMid": "MID001", "type": "PURCHASE",
    "status": "SUCCESS", "amount": 150000, "occurredAt": "2026-10-20T14:33:00+07:00", "settlementRef": "STL-20261020-01" } ] }
```
Response per item: `CREATED | UPDATED | DUPLICATE | CONFLICT | REJECTED` (+ `errors`).
* Idempotency: `(source, externalId)` is unique. Replays return `DUPLICATE`; nothing is credited twice.
* Allowed updates: `PENDING → SUCCESS/FAILED/REVERSED`, `SUCCESS → REVERSED` (reverses the reward).
  Anything else (e.g. different amount) is a `CONFLICT` and opens a reconciliation exception.
* Status synonyms: APPROVED/SETTLED/00 → SUCCESS; DECLINED/ERROR → FAILED; VOIDED/REFUNDED → REVERSED.
* Max 5 000 items per request; 600 requests/min per key.

## Settlement reports
```http
POST /api/v1/settlements
{ "settlements": [ { "settlementRef": "STL-20261020-01", "settlementDate": "2026-10-20", "expectedCount": 182, "expectedAmount": 27450000 } ] }
```
Daily reconciliation (02:00 WIB, or manual) compares each report with the SUCCESS transactions that
carry its `settlementRef`. Only reconciled (or explicitly accepted) settlements make transactions
eligible for the Rp500 reward.

## Webhooks
```
POST /api/v1/webhooks/transactions
X-Api-Key: <key>
X-Hausjo-Timestamp: <unix seconds>            (±300 s)
X-Hausjo-Event-Id: <unique id>                (idempotency)
X-Hausjo-Signature: sha256=<hex HMAC-SHA256(webhookSecret, timestamp + "." + rawBody)>

{ "type": "transactions" | "settlements", "data": [ … ] }
```
* `202 Accepted` → queued; `200` with `duplicate: true` for a replayed event id.
* Processing is asynchronous with exponential backoff (6 attempts); then **dead letter**, replayable
  from Admin → Integrasi.
* Example signer: see `/api-docs`.

## Portal endpoints (session)
Registration (`/auth/registration-otp`, `/agents/register`), leads, payments, device assignment &
activation, refunds, commissions (list + explanation), wallet, withdrawals (`Idempotency-Key` header),
payout batches/attempts (maker-checker enforced), reconciliation runs, notifications and dashboards.
Every endpoint enforces the same RBAC + object-level checks as the UI (they call the same services).
See the OpenAPI document for the complete list.

## Files
`GET /api/files/{id}` — authorized download; RESTRICTED documents (KYC, merchant documents) are
audited on every access.
