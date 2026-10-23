# HAUSJO AGENT NETWORK — Architecture

PT Hausjo Digital Pro · agent recruitment, EDC sales, merchant onboarding, referrals, commissions,
transaction rewards and payouts.

> Locale defaults: **IDR** (whole Rupiah, `bigint`), **Asia/Jakarta** (UTC+7, no DST), **Bahasa
> Indonesia** UI with English as an option (cookie `lang`).

## 1. System overview

```
                ┌──────────────────────────── Next.js (App Router) ───────────────────────────┐
 Browser ──────▶│ Public site  /  /register  /login  /r/[code]                                 │
 (agent,        │ Agent portal /agent/*      Admin portal /admin/*     Merchant portal /merchant/* │
  admin,        │   ▲ React Server Components + Server Actions (forms, RHF + Zod)                │
  merchant)     │   │                                                                          │
                │ REST API /api/v1/*  (session cookie or API key) · OpenAPI at /api/v1/openapi  │
 Processors ───▶│ Webhooks /api/v1/webhooks/transactions (HMAC, idempotent, dead-letter)       │
                └───────────────┬──────────────────────────────────────────────────────────────┘
                                │ every entry point calls the same service layer
                ┌───────────────▼──────────────────────────────────────────────────────────────┐
                │ src/server/modules/*  domain services (authorize → validate → transact → audit)│
                │ src/server/commission/engine.ts  pure, versioned rule engine                  │
                │ src/server/ledger.ts  double-entry journals + wallet cache (row-locked)       │
                │ src/server/jobs/*     Postgres job queue (SKIP LOCKED) + scheduler            │
                │ adapters: storage (local|S3), OTP/SMS, email, WhatsApp, malware scan, payout   │
                └───────────────┬──────────────────────────────────────────────────────────────┘
                                ▼
                     PostgreSQL 16 (Prisma ORM) — constraints, partial unique indexes,
                     append-only triggers, deferred "journal balanced" trigger
 Worker process (npm run worker): runs jobs, releases commissions, daily reconciliation.
 S3-compatible storage (MinIO locally): KYC, merchant docs, payment/payout proofs, imports.
```

### Layers

| Layer | Location | Responsibility |
|---|---|---|
| UI | `src/app`, `src/components` | RSC pages; client components only for interactivity (forms, tables, charts) |
| Actions / API | `src/app/**/actions.ts`, `src/app/api/v1/**` | Parse input (Zod), build `Actor`, call a service, map errors |
| Services | `src/server/modules/*` | Authorization (RBAC + object-level), business rules, DB transactions, audit, notifications |
| Engine | `src/server/commission/engine.ts` | Pure functions: rule selection, amount calculation, explanation payload |
| Ledger | `src/server/ledger.ts` | Balanced journals, idempotent by `journalRef`, wallet balance cache |
| Infra | `src/server/{db,auth,crypto,storage,jobs,notifications}` | Cross-cutting concerns |

Services never trust the caller: every exported service function takes an `Actor` and checks
permissions itself, so UI, REST and jobs share one enforcement point.

## 2. Domain model (summary — full schema in `prisma/schema.prisma`, see `docs/database.md`)

* **Identity**: `User`, `Role`, `UserRole`, `Session`, `OtpChallenge`, `Consent`, `ApiClient`, `RateLimitBucket`
* **Agents**: `Agent`, `AgentKYC`, `AgentAgreement`, `AgentBankAccount`, `AgentReferral`, `Wallet`
* **Catalog**: `Product`, `ProductPrice` (effective-dated), `CommissionRule` (versioned)
* **Merchants**: `MerchantLead` → `Merchant` (+ `MerchantAttribution`, `MerchantDocument`)
* **Sales**: `SalesOrder`, `Payment`, `Device`, `InventoryMovement`, `Activation`
* **Transactions**: `Transaction`, `Settlement`, `TransactionImport`, `ImportRow`, `ReconciliationRun`, `ReconciliationException`
* **Money**: `CommissionEvent`, `LedgerJournal`, `CommissionLedgerEntry`, `ReferralCommission`, `WithdrawalRequest`, `PayoutBatch`, `PayoutAttempt`
* **Platform**: `Notification`, `NotificationDelivery`, `AuditLog`, `SystemSetting`, `Job`, `WebhookEvent`, `FraudFlag`, `Dispute`, `StoredFile`

## 3. Core flows

### 3.1 Agent registration
1. Public `/register` (optionally `/r/{referralCode}` → prefilled). Applicant requests an OTP for their phone (rate-limited per IP + phone).
2. Submit full form + OTP + required consents (Terms, Privacy, Data Processing; WhatsApp optional).
3. Server, in one DB transaction: verifies OTP, checks duplicates (email, phone, bank-account blind index), validates referral code (referrer must be `ACTIVE`, not self), creates `User`(AGENT) + `Agent`(`PENDING`, `agentCode` `HJA-000001`, permanent `referralCode`) + `Wallet` + `AgentBankAccount`(`PENDING_VERIFICATION`) + `AgentAgreement` + `Consent` rows + `AgentReferral`(`PENDING`).
4. Agent completes the onboarding checklist (KYC upload: KTP + selfie + NIK, encrypted).
5. Operations verifies KYC + bank account, then approves → agent `ACTIVE`, referral `APPROVED`. Only `ACTIVE` agents accrue releasable commissions or withdraw.

### 3.2 Merchant onboarding → sale → activation
`Lead → Contacted → Application Submitted → Under Review → (Revision Requested ↺) → Approved → Payment Verified → Device Assigned → Activated → Commission Eligible`, plus `Rejected`, `Cancelled`, `Refunded`, `Suspended`.

* Lead `dedupeKey` (normalized phone + business name) blocks the same merchant being claimed twice (prevents attribution theft).
* Approval creates the permanent `Merchant` (`HJM-000001`), opens `MerchantAttribution` to the agent, and creates a `SalesOrder` with a price snapshot.
* Payment verification (proof upload, unique `(method, reference)`), device assignment (atomic `IN_STOCK → ASSIGNED`, `Device.orderId` unique), activation (`terminalId` unique, one live activation per device).

### 3.3 Sales commission
At activation (all prerequisites verified) the service accrues one `CommissionEvent` `SALE:{orderId}`:
* Rule chosen by the engine for the product at the configured date basis (default: order date).
* `PENDING` until `holdUntil = activatedAt + rule.holdDays` (refund/fraud review window).
* Release job: `PENDING → ELIGIBLE` (agent active, no open fraud flags, order not refunded, merchant not suspended) → `APPROVED` (auto, or by Finance if `requiresManualApproval`) → `PAYABLE`.
* Refund/fraud → reversal (see 3.7).

### 3.4 Recurring transaction reward (Rp500 per eligible settled transaction)
Ingestion (REST, signed webhook, CSV/XLSX import) normalizes `source, externalId, terminalId, processorMid, type, status, amount, occurredAt, settlementRef`. `idempotencyKey = source:externalId` is unique. Matching maps `terminalId → Device → Merchant` and attribution at `occurredAt`.
Eligibility (all required): `status = SUCCESS`, not test, not excluded type, matched merchant + device active at that time, attributed agent, **settled** (its `Settlement` reconciled), active rule. One event `TXN:{transactionId}`; unique `(type, sourceTransactionId)`.
Daily reconciliation compares settlement reports with transactions; mismatches and unmatched terminals go to the exception queue and are not rewarded until resolved. A later `REVERSED` status reverses the reward.

### 3.5 Referral share (direct recruits only)
When a recruit's `SALES` or `TRANSACTION_REWARD` event becomes `ELIGIBLE`, the engine selects the active `REFERRAL_SALES` / `REFERRAL_TRANSACTION` rule (separate percentages) and creates `REF:{baseEventId}` for the **direct** referrer only — computed as `floor(recruitNet × rateBps / 10 000)`, optional cap. The recruit's amount is not reduced unless the rule sets `deductFromRecruit`. Referrals pay nothing for sign-ups. Base reversal cascades to the referral event.

### 3.6 Ledger & wallet
Double-entry accounts per agent: `AGENT_PENDING`, `AGENT_PAYABLE`, `AGENT_RESERVED` (liabilities), `AGENT_RECEIVABLE` (clawback asset); company `COMMISSION_EXPENSE`, `PAYOUT_CLEARING`.

| Journal | Debit | Credit |
|---|---|---|
| ACCRUAL | COMMISSION_EXPENSE | AGENT_PENDING |
| RELEASE | AGENT_PENDING | AGENT_PAYABLE (after offsetting AGENT_RECEIVABLE first = CLAWBACK_RECOVERY) |
| WITHDRAWAL_RESERVE | AGENT_PAYABLE | AGENT_RESERVED |
| WITHDRAWAL_RELEASE (reject/cancel/give up) | AGENT_RESERVED | AGENT_PAYABLE |
| PAYOUT (confirmed) | AGENT_RESERVED | PAYOUT_CLEARING |
| REVERSAL (pending) | AGENT_PENDING | COMMISSION_EXPENSE |
| REVERSAL (payable) / CLAWBACK (already withdrawn) | AGENT_PAYABLE / AGENT_RECEIVABLE | COMMISSION_EXPENSE |

`Wallet` caches balances in the same transaction (row-locked); a DB `CHECK` keeps every balance ≥ 0 and a deferred trigger rejects unbalanced journals. Ledger tables are append-only (trigger).

### 3.7 Reversals & clawback
Reversal of an event uses its net amount: from `AGENT_PENDING` if not yet payable; otherwise from `AGENT_PAYABLE` up to the available balance and the remainder as `AGENT_RECEIVABLE` (recovered automatically from future releases). Referral events derived from the reversed event are reversed too. Events are never edited or deleted; amount/rule snapshot are immutable at DB level.

### 3.8 Withdrawals & payouts (manual bank transfer, maker-checker)
1. Agent requests ≥ configured minimum, ≤ payable, to a **verified** bank account. Wallet row lock + partial unique index (one open withdrawal per agent) + idempotency key.
2. Finance approves/rejects. Approved requests go into a `PayoutBatch` (maker); a **different** user approves the batch (checker; DB `CHECK`).
3. Approved batch creates `PayoutAttempt`s and a bank-transfer CSV for manual execution. **The system never simulates a transfer.**
4. Finance records the bank reference + proof (`SUBMITTED`); a different user confirms against the bank statement (`CONFIRMED`) → withdrawal `PAID`, `PAYOUT` journal. Failures → `FAILED`; retry creates a new attempt (one live attempt per withdrawal, partial unique index) or funds are returned.
5. `DisbursementProvider` interface (`src/server/payouts/provider.ts`) — `ManualBankTransferProvider` today; a licensed API provider can be added later.

## 4. Cross-cutting

* **Auth**: email/phone + password (Argon2id), opaque session token (SHA-256 at rest), httpOnly `SameSite=Lax` `Secure` cookie, 12 h absolute / 2 h idle. Admin roles require TOTP MFA. Account lockout + DB-backed rate limits.
* **Authorization**: permission matrix in `src/server/rbac.ts`; object-level checks in services (agents only see their own merchants/earnings; merchants only their own data).
* **Audit**: every state change writes `AuditLog` (append-only, redacted).
* **Background jobs**: `Job` table, `FOR UPDATE SKIP LOCKED`, exponential backoff, `DEAD` after max attempts. Scheduler in `scripts/worker.ts`: commission release every 15 min, reconciliation daily 02:00 WIB (previous day), rate-limit pruning daily.
* **Adapters**: every external integration has an interface + `Mock*` implementation; mocks are labeled in the UI and refused in production unless `ALLOW_MOCK_PROVIDERS=true`.
* **i18n**: `src/lib/i18n` dictionaries (`id`, `en`).

## 5. Route map
See `docs/routes.md`.

## 6. Security model
See `docs/security.md`.

## 7. Implementation plan
See `docs/implementation-plan.md`.

## 8. Assumptions (configurable, documented)
See `docs/assumptions.md`.
