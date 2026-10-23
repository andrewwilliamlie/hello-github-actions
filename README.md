# HAUSJO AGENT NETWORK

Agent recruitment, EDC sales, merchant onboarding, referral, commission, transaction-reward and
payout platform for **PT Hausjo Digital Pro**.

Next.js 15 (App Router) · TypeScript · Tailwind + shadcn-style UI · PostgreSQL 16 + Prisma 6 ·
Zod · React Hook Form · TanStack Table · Recharts · Postgres-backed job queue · S3-compatible storage.
Defaults: **IDR** (integer Rupiah), **Asia/Jakarta**, **Bahasa Indonesia** (English toggle).

> **Demo vs production.** The seed creates sample data labelled *DEMO* (banner, `isDemo` flags,
> `(Demo)` names, `*.test` emails). SMS/OTP, email and WhatsApp use **mock providers** unless real ones
> are configured; mocks send nothing and are labelled MOCK in the UI. Payouts are **manual bank
> transfers** recorded with proof and confirmed by a second person — the system never simulates a
> successful transfer. No real third-party integration is active out of the box.

## What it does

| Area | Highlights |
|---|---|
| Recruitment | Public landing page with illustrative (non-guaranteed) earnings, self-registration with OTP, consents, permanent agent ID + referral code + `/r/{code}` link, anti-duplicate & anti-farming checks |
| Onboarding | Checklist: agreement, KYC (encrypted NIK + KTP/selfie, restricted access), bank account verification, admin approval |
| Merchants | Lead → Contacted → Submitted → Under review (↺ revision) → Approved → Payment verified → Device assigned → Activated → Commission eligible; reject/cancel/refund/suspend; dedupe prevents attribution theft; bulk CSV/XLSX import |
| Sales commission | Per-SKU, versioned, effective-dated rules (Rp50.000–Rp150.000 range enforced); one event per sale; hold window for refund/fraud; optional manual approval |
| Transaction rewards | Rp500 per **eligible settled** transaction; API, signed webhooks and CSV/XLSX ingestion; idempotent; daily settlement reconciliation with exception queue |
| Referrals | Direct recruits only; separate configurable % for sales and transaction commissions, computed on the recruit's eligible **net** commission; no sign-up rewards; circular/self-referral prevention; audited, non-retroactive reassignment; informational network tree |
| Money | Immutable double-entry ledger, wallet (pending / payable / in withdrawal / paid / clawback), reversals & clawback, withdrawals, maker-checker payout batches, manual transfer + confirmation, failure/retry, statements |
| Admin | Analytics dashboard, queues, rules, imports, reconciliation, disputes, fraud flags, exports (CSV/XLSX), notification outbox, API clients & webhooks (dead-letter replay), audit log, settings, users |

## Quick start (local)

Requirements: Node 22, PostgreSQL 16 (or Docker), npm.

```bash
cp .env.example .env
# fill the three secrets (32-byte keys must be base64):
#   FIELD_ENCRYPTION_KEY=$(openssl rand -base64 32)
#   BLIND_INDEX_KEY=$(openssl rand -base64 32)
#   OTP_PEPPER=$(openssl rand -hex 24)
# and set DEMO_MODE=true for the demo banner.

docker compose up -d db minio      # or use your own Postgres (see docs/setup.md)
npm ci
npm run db:migrate                 # prisma migrate deploy
npm run db:seed                    # DEMO data (~1–2 min; runs the real services)
npm run dev                        # http://localhost:3000
npm run worker                     # second terminal: jobs, commission release, daily reconciliation
```

### Demo accounts (password `Hausjo#Demo2026`)

| Role | Login | Notes |
|---|---|---|
| Super Admin | `superadmin@hausjo.test` | TOTP MFA — `npm run demo:totp` prints current codes |
| Finance Admin (maker) | `finance@hausjo.test` | MFA |
| Finance Admin (checker) | `finance2@hausjo.test` | MFA — second person for maker-checker |
| Operations Admin | `ops@hausjo.test` | MFA |
| Agent (referrer) | `budi@agent.test` | Active, has recruits, merchants, a paid withdrawal |
| Agent | `siti@agent.test`, `rina@agent.test`, `dewi@agent.test` | Active |
| Agent (pending) | `andi@agent.test` | KYC submitted, awaiting approval |
| Merchant | `merchant@merchant.test` | Merchant portal |

The seed also prints a demo **API key** and **webhook secret** for the `DEMO_PROCESSOR` source.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm run worker` | Background worker (job queue + scheduler) |
| `npm run db:migrate` / `db:seed` / `db:reset` | Database |
| `npm test` | Unit + integration tests (uses `hausjo_test`; see docs/setup.md) |
| `npm run test:e2e` | Playwright E2E against a production build and an isolated `hausjo_e2e` DB (`npm run build` first) |
| `npm run lint` / `typecheck` | Static checks |
| `npm run demo:totp` | Current TOTP codes for demo admins |

## Documentation

| Doc | Contents |
|---|---|
| [docs/architecture.md](docs/architecture.md) | System design, flows, ledger model |
| [docs/database.md](docs/database.md) | Schema overview and DB-level guarantees |
| [docs/routes.md](docs/routes.md) | Route map |
| [docs/security.md](docs/security.md) | Security model |
| [docs/api.md](docs/api.md) | REST API, webhooks, integration guide (OpenAPI at `/api/v1/openapi.json`, rendered at `/api-docs`) |
| [docs/setup.md](docs/setup.md) | Local setup & testing |
| [docs/deployment.md](docs/deployment.md) | Production deployment, backups/restore, key rotation |
| [docs/admin-guide.md](docs/admin-guide.md) | Operating procedures per role |
| [docs/assumptions.md](docs/assumptions.md) | Configurable defaults and decisions |
| [docs/compliance-review.md](docs/compliance-review.md) | Legal/compliance items to review before go-live |
| [docs/implementation-plan.md](docs/implementation-plan.md) | Plan and status |

## Project layout

```
prisma/              schema, migrations (with SQL integrity guarantees), demo seed
src/app/             (public) landing/register/login · agent/ · admin/ · merchant/ · api/
src/server/          domain services (modules/), ledger, rule engine, auth, RBAC, jobs, storage, notifications, API router
src/components/      UI primitives, layout, charts, shared widgets
src/lib/             money (bigint), time (WIB), i18n dictionaries, helpers
scripts/             worker, TOTP helper
tests/               unit/, integration/ (real Postgres), e2e/ (Playwright)
```

## License

See [LICENSE](LICENSE).
