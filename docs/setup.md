# Local setup

## Prerequisites
* Node.js 22 and npm
* PostgreSQL 16 — either `docker compose up -d db` or a local server
* Optional: Docker for MinIO (S3) and ClamAV

## 1. Configure
```bash
cp .env.example .env
```
Fill in:

| Variable | How |
|---|---|
| `FIELD_ENCRYPTION_KEY` | `openssl rand -base64 32` (AES-256-GCM key for NIK, bank accounts, TOTP secrets) |
| `BLIND_INDEX_KEY` | `openssl rand -base64 32` (HMAC key for duplicate detection) |
| `OTP_PEPPER` | `openssl rand -hex 24` |
| `DATABASE_URL` | defaults to the Compose database |
| `DEMO_MODE` | `true` when using the demo seed |

Storage defaults to `./storage` on disk. To use MinIO locally: `docker compose up -d minio`, then
`STORAGE_DRIVER=s3 S3_ENDPOINT=http://localhost:9000 S3_BUCKET=hausjo-files S3_ACCESS_KEY_ID=hausjo
S3_SECRET_ACCESS_KEY=hausjo-dev-secret S3_FORCE_PATH_STYLE=true S3_SSE=none`.

## 2. Database
```bash
npm ci
npm run db:migrate      # applies prisma/migrations (includes SQL triggers/constraints)
npm run db:seed         # DEMO data, refuses to run twice
```
To start over: `npm run db:reset` (drops all data, re-applies migrations) then `npm run db:seed`.

## 3. Run
```bash
npm run dev             # web on :3000
npm run worker          # background jobs (notifications, webhooks, release every 15 min, reconciliation 02:00 WIB)
```
Admin sign-in requires TOTP. With demo data run `npm run demo:totp` for the current codes (or add the
secrets from `prisma/seed-constants.ts` to an authenticator app). New admins enrol on first sign-in.

Mock providers: the registration page shows the OTP in a "MOCK" box; emails/WhatsApp messages appear
in **Admin → Kotak keluar notifikasi**. Nothing is sent externally.

## 4. Tests
| Suite | Command | Needs |
|---|---|---|
| Unit + integration (80 tests) | `npm test` | Postgres database `hausjo_test` owned by the app user (override with `TEST_DATABASE_URL`). Migrations are applied automatically; every suite truncates the test DB. |
| E2E (Playwright, 15 tests) | `npm run build && npm run test:e2e` | Chromium (`npx playwright install chromium`), permission to create/drop `hausjo_e2e` (the setup refuses any DB name without `e2e`). Starts `next start` on :3100 with a freshly seeded DB. |

Create the test database once:
```sql
CREATE USER hausjo WITH PASSWORD 'hausjo' CREATEDB;
CREATE DATABASE hausjo_test OWNER hausjo;
```

## Troubleshooting
* `Invalid environment configuration` — a required variable is missing; the message names it.
* `Mock providers are not allowed in production` — configure real providers or, for staging only,
  `ALLOW_MOCK_PROVIDERS=true`.
* Admin redirected to `/login/mfa/setup` — first sign-in; scan the QR code.
