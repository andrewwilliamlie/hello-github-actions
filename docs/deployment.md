# Deployment guide

## Topology
```
          HTTPS (TLS terminated at load balancer / ingress)
                │
        ┌───────▼────────┐        ┌──────────────┐
        │ web × N        │        │ worker × 1–N │   same image, `npm run worker`
        │ `npm start`    │        └──────┬───────┘
        └───────┬────────┘               │
                ├──────── PostgreSQL 16 (managed: RDS / Cloud SQL / Azure; PITR enabled)
                └──────── S3-compatible bucket (private, SSE on, versioning on)
```
* Web is stateless (sessions in Postgres) — scale horizontally.
* Workers can run in parallel (`FOR UPDATE SKIP LOCKED`); schedules are deduplicated per time slot.
* Migrations run as a one-off job before rolling out: `npx prisma migrate deploy`.

## Build & run
```bash
docker build -t hausjo-agent-network:<version> .
docker run --env-file prod.env hausjo-agent-network:<version> npx prisma migrate deploy   # job
docker run --env-file prod.env -p 3000:3000 hausjo-agent-network:<version>              # web
docker run --env-file prod.env hausjo-agent-network:<version> npm run worker            # worker
```
Health check: `GET /api/health` (200 when the DB answers). The image runs as a non-root user.

## Production configuration checklist
| Item | Setting |
|---|---|
| Secrets | From a secret manager (AWS Secrets Manager, GCP Secret Manager, Vault, Kubernetes secrets). Never in the image or repo. |
| `NODE_ENV` | `production` (enables Secure cookies, refuses mock providers) |
| `APP_URL` | Public HTTPS origin (used for referral links and CSRF origin checks) |
| `FIELD_ENCRYPTION_KEY`, `BLIND_INDEX_KEY`, `OTP_PEPPER` | Unique per environment; back up the keys separately from DB backups |
| `STORAGE_DRIVER=s3` | Private bucket, block public access, `S3_SSE=AES256` or `aws:kms`, versioning + lifecycle |
| `SMS_PROVIDER` | A real OTP/SMS provider adapter must be implemented (`src/server/notifications/sms.ts`) before launch |
| `EMAIL_PROVIDER=smtp` | `SMTP_URL` with TLS |
| `WHATSAPP_PROVIDER=cloud_api` | Only after BSP onboarding, approved templates and opt-in flow review |
| `MALWARE_SCANNER=clamav` | clamd reachable at `CLAMAV_HOST:CLAMAV_PORT` |
| `ADMIN_MFA_REQUIRED` | `true` |
| `DEMO_MODE` | `false`; do **not** run the demo seed in production |
| Initial admin | Create the first Super Admin with a one-off script or SQL (see below), then add others in the UI |

### Creating the first Super Admin
```bash
docker run --rm --env-file prod.env hausjo-agent-network:<version> node -e '
const {PrismaClient}=require("@prisma/client");const {hash}=require("@node-rs/argon2");
(async()=>{const p=new PrismaClient();for(const [key,name] of [["SUPER_ADMIN","Super Admin"],["FINANCE_ADMIN","Finance Admin"],["OPERATIONS_ADMIN","Operations Admin"],["AGENT","Agent"],["MERCHANT","Merchant"]])await p.role.upsert({where:{key},create:{key,name,description:name},update:{}});
const r=await p.role.findUniqueOrThrow({where:{key:"SUPER_ADMIN"}});
await p.user.create({data:{email:process.env.ADMIN_EMAIL,name:"Super Admin",passwordHash:await hash(process.env.ADMIN_PASSWORD,{algorithm:2,memoryCost:19456,timeCost:2}),roles:{create:{roleId:r.id}}}});await p.$disconnect()})()'
```
Run with `-e ADMIN_EMAIL=… -e ADMIN_PASSWORD=…`; the admin enrols TOTP on first sign-in.

## Backups & restore
* **Database**: managed PITR (≥ 35 days) + daily logical dump:
  `pg_dump --format=custom --no-owner "$DATABASE_URL" > hausjo-$(date +%F).dump` → encrypted, off-site.
  Restore: `pg_restore --clean --no-owner -d "$TARGET_URL" hausjo-YYYY-MM-DD.dump`, then
  `npx prisma migrate deploy` (no-op if current). Ledger/audit triggers are restored with the schema.
* **Files**: bucket versioning + cross-region replication; KYC objects carry `retentionUntil` metadata in the DB.
* **Keys**: store `FIELD_ENCRYPTION_KEY` / `BLIND_INDEX_KEY` in the secret manager with versioning — a
  DB backup is useless without the matching keys.
* **Restore drill (quarterly)**: restore into staging and run read-only integrity checks — every
  journal balances (`SELECT "journalId" FROM "CommissionLedgerEntry" GROUP BY 1 HAVING SUM(CASE WHEN
  "direction"='DEBIT' THEN "amount" ELSE -"amount" END) <> 0` returns no rows) and wallet caches equal
  ledger balances (`ledgerBalances()` in `src/server/ledger.ts`).

## Key rotation
Ciphertexts are versioned (`v1.<iv>.<tag>.<ct>`). To rotate `FIELD_ENCRYPTION_KEY`: deploy a build that
reads both keys (add `v2` with the new key in `src/server/crypto.ts`), run a batch job that decrypts with
v1 and re-encrypts with v2 for `AgentKYC.idNumberEnc`, `AgentBankAccount.accountNumberEnc`,
`User.mfaSecretEnc`, `ApiClient.webhookSecretEnc`, then remove v1. Rotating `BLIND_INDEX_KEY` requires
recomputing `idNumberHash` and `accountNumberHash` from decrypted values in the same job.

## Data retention
KYC documents record `retentionUntil` (setting `kyc.retentionDays`). Schedule a periodic job to delete
storage objects and null the encrypted fields for closed accounts past retention (legal sign-off needed
on the period — see compliance-review.md). Ledger and audit data are retained for financial/tax purposes.

## Observability
* Structured logs to stdout (redacted). Ship to your log platform.
* Watch: job queue depth / `DEAD` jobs (Admin → Integrasi), webhook dead letters, open reconciliation
  exceptions, open fraud flags, failed payouts.
