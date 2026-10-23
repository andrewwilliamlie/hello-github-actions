# Implementation plan

Starting point: the repository contained only `README.md` and `LICENSE` (a GitHub Actions
tutorial skeleton). The reference artifact ("EDC Agent Hub") was used for interaction patterns:
month-scoped overview KPIs, agent list with referral codes, merchant onboarding sheet, per-agent
statement styled as an EDC thermal receipt, copyable invite message, product commission settings.

## Phase 0 — Foundations ✅
* Next.js 15 App Router, TypeScript strict, Tailwind + shadcn-style components, Prisma 6 / PostgreSQL 16.
* Prisma schema + migration with DB-level guarantees (checks, partial unique indexes, append-only and balanced-journal triggers).
* Architecture, routes, security docs.

## Phase 1 — Vertical slice (priority)
1. Infra: env validation, crypto (AES-GCM, blind index), money (`bigint`), Jakarta time, errors, audit, settings, RBAC, sessions, OTP, MFA, rate limits, storage + upload validation, job queue.
2. Registration → admin approval (KYC, bank verification).
3. Merchant lead → submit → review → approve (merchant, attribution, order).
4. Payment verification → device assignment → activation → sales commission accrual.
5. Transaction ingestion (API, webhook, import) → settlement reconciliation → Rp500 reward.
6. Referral share on recruit's eligible events.
7. Release job → payable; withdrawal → batch (maker-checker) → manual transfer record → confirmation → paid.
8. Reversals: refund, transaction reversal, fraud; clawback after payout.

## Phase 2 — Breadth
Admin & agent dashboards (Recharts), exports (CSV/XLSX), notification centre + email/WhatsApp adapters,
imports (preview, dedupe, error report, idempotent re-import), disputes, fraud flags, audit viewer,
settings, merchant portal, landing page, OpenAPI spec.

## Phase 3 — Quality
Unit tests (engine, money, ledger math), integration tests against a real Postgres database
(full lifecycle, duplicates, concurrency, authorization, circular referrals, refund after payout,
import retries), Playwright E2E (agent + admin journeys), Docker Compose, guides.

## Out of scope for MVP (designed for)
* Real disbursement API (adapter interface ready).
* Real SMS/WhatsApp/email providers (interfaces + mocks; SMTP adapter works when configured).
* Multi-level referral payments (explicitly disabled; deeper tree is visual only).
