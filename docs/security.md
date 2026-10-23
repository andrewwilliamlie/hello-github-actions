# Security model

## Authentication
* Passwords: Argon2id (`@node-rs/argon2`, m=19 MiB, t=2). Minimum 10 characters, letters + digits.
* Sessions: 256-bit random token in an `httpOnly`, `Secure` (production), `SameSite=Lax` cookie `hj_session`; only the SHA-256 hash is stored. Absolute lifetime 12 h, idle timeout 2 h, rotated on login, revoked on logout/password change.
* Admin MFA: TOTP (RFC 6238) mandatory for `SUPER_ADMIN`, `FINANCE_ADMIN`, `OPERATIONS_ADMIN` (`ADMIN_MFA_REQUIRED=true`). A session is not `mfaVerified` until the code is checked; admin routes and admin services reject non-MFA sessions. TOTP secrets are encrypted at rest.
* Lockout: 5 failed logins → 15-minute lock. Rate limits (DB-backed, multi-instance safe) on login, OTP send/verify, registration, withdrawal requests, webhook ingestion.
* OTP: 6 digits, SHA-256 hashed with pepper, 5-minute expiry, 5 attempts, 60 s resend cooldown. Delivery via `SmsProvider`; the `MockSmsProvider` shows the code in the UI **only** in non-production mock mode and is labelled.

## Authorization
* RBAC matrix `src/server/rbac.ts` (permission strings per role). Checked **server-side in every service function**; the UI only hides what the server would refuse anyway.
* Object-level rules: agents access only their own leads/merchants/orders/commissions/wallet/files; merchants only their own merchant record, devices and transactions; restricted files (KYC) only by `kyc.review` holders and the owning agent's upload confirmation (never re-download for agents).
* Maker-checker: payout batch creator ≠ approver; payout recorder ≠ confirmer; rule creator ≠ approver. Enforced in services **and** DB `CHECK` constraints.
* Privileged changes (merchant attribution, referrer reassignment, manual adjustments) require `SUPER_ADMIN`, a reason, and are audited.

## CSRF
* Server Actions: Next.js validates `Origin` against `Host`.
* REST routes with cookie auth: state-changing methods require same-origin `Origin`/`Referer` (`src/server/http.ts`). API-key and webhook routes do not use cookies.
* `SameSite=Lax` cookies.

## Data protection
* Field encryption: AES-256-GCM (`FIELD_ENCRYPTION_KEY`) for NIK/KTP number, bank account number, TOTP secret, API webhook secrets. Duplicates detected through HMAC-SHA256 blind indexes (`BLIND_INDEX_KEY`). UI shows only last 4 digits.
* KYC documents: `RESTRICTED` classification, stored with random keys, never publicly addressable, streamed through an authorized route; each view audited. Retention (`kyc.retentionDays`) recorded per record; purge job documented in admin guide.
* Logs: `redact()` strips `password`, `otp`, `token`, `accountNumber`, `idNumber`, `secret`, `authorization` keys from audit payloads and server logs.

## Uploads
* Size limit (default 8 MB), extension + MIME allow-list **and** magic-byte sniffing (PDF, PNG, JPEG, WEBP, CSV/plain text, XLSX zip). SVG/HTML rejected.
* Malware scanning via `MalwareScanner` (`clamav` driver for clamd, or `none` → status `NOT_SCANNED` surfaced in UI, refused in production unless explicitly allowed).
* Files served with `Content-Disposition: attachment` for non-images, `X-Content-Type-Options: nosniff`.

## Webhooks & API keys
* `X-Api-Key` (prefix + secret; only SHA-256 stored). Each client is bound to one transaction `source`.
* Webhooks: `X-Hausjo-Timestamp` + `X-Hausjo-Signature: sha256=HMAC(secret, timestamp + "." + rawBody)`, ±5 min skew, constant-time compare. `X-Hausjo-Event-Id` makes delivery idempotent (`WebhookEvent` unique). Processing is async with retries and a dead-letter queue (admin replay).

## Financial integrity
* Integer IDR (`bigint`) only; percentages in basis points with explicit floor rounding.
* Unique keys: `CommissionEvent.eventRef`, `(type, sourceOrderId|sourceTransactionId|sourceEventId)`, `Transaction(source, externalId)`, `LedgerJournal.journalRef`, `WithdrawalRequest.idempotencyKey`, `Payment(method, reference)`.
* Append-only ledger/audit (triggers), immutable commission amounts, deferred balanced-journal trigger, non-negative wallet `CHECK`, partial unique indexes for open withdrawals and live payout attempts.

## Headers
CSP, HSTS, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy` (see `next.config.ts`).

## Secrets
All secrets come from environment variables (`.env.example` lists them, none committed). In production use the platform secret manager (e.g. AWS Secrets Manager / Doppler / Kubernetes secrets). Rotate `FIELD_ENCRYPTION_KEY` via the documented re-encryption procedure (`docs/deployment.md`).

## Compliance items flagged for legal review
See `docs/compliance-review.md` (UU PDP No. 27/2022, OJK/BI rules on payment agents, tax withholding PPh 21/23 on commissions, consumer-protection wording of earnings claims, KYC retention periods, WhatsApp Business policy).
