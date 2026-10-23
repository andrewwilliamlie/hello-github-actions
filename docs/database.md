# Database

Source of truth: `prisma/schema.prisma` + `prisma/migrations/*/migration.sql` (the migration adds SQL
the Prisma DSL cannot express).

## Model groups
| Group | Tables |
|---|---|
| Identity | `User`, `Role`, `UserRole`, `Session`, `OtpChallenge`, `Consent`, `ApiClient`, `RateLimitBucket` |
| Agents | `Agent`, `AgentKYC`, `AgentAgreement`, `AgentBankAccount`, `AgentReferral`, `Wallet` |
| Catalog & rules | `Product`, `ProductPrice` (effective-dated), `CommissionRule` (versioned by `code`+`version`) |
| Merchants | `MerchantLead`, `Merchant`, `MerchantAttribution` (effective-dated), `MerchantDocument` |
| Sales & devices | `SalesOrder` (price snapshot), `Payment`, `Device`, `InventoryMovement`, `Activation` |
| Transactions | `Transaction`, `Settlement`, `TransactionImport`, `ImportRow`, `ReconciliationRun`, `ReconciliationException` |
| Money | `CommissionEvent`, `LedgerJournal`, `CommissionLedgerEntry`, `ReferralCommission`, `WithdrawalRequest`, `PayoutBatch`, `PayoutAttempt` |
| Platform | `Notification`, `NotificationDelivery`, `AuditLog`, `SystemSetting`, `Job`, `WebhookEvent`, `FraudFlag`, `Dispute`, `StoredFile` |

## Conventions
* Money: `BIGINT` whole Rupiah; percentages in basis points (`Int`).
* IDs: cuid; human IDs `HJA-000001` (agents), `HJM-000001` (merchants), `ORD-n`, `WD-n`, `BATCH-n`.
* History is never overwritten: prices, rules, attributions, referrals use effective/ended timestamps;
  commission events snapshot the rule (`ruleSnapshot`, `calculation`).
* Soft deletion (`deletedAt`) on master data referenced by financial history.
* `@db.Date` business dates are Asia/Jakarta calendar days.

## Guarantees enforced by PostgreSQL
| Guarantee | Mechanism |
|---|---|
| No double commission | `CommissionEvent.eventRef` unique; unique `(type, sourceOrderId)`, `(type, sourceTransactionId)`, `(type, sourceEventId)` |
| No double transaction | `Transaction(source, externalId)` and `idempotencyKey` unique |
| Idempotent postings | `LedgerJournal.journalRef` unique |
| Balanced double entry | Deferred constraint trigger `ledger_journal_balanced` (checked at commit) |
| Immutable ledger & audit | `BEFORE UPDATE OR DELETE` triggers raise on `CommissionLedgerEntry`, `LedgerJournal`, `AuditLog`, `ReferralCommission` |
| Immutable commission amounts | Trigger blocks changes to amount, beneficiary, eventRef, type, rule snapshot, calculation and deletes |
| Non-negative balances | `CHECK` on all `Wallet` balances; positive amounts on events, entries, withdrawals, attempts |
| One open withdrawal per agent | Partial unique index on `WithdrawalRequest(agentId)` for open statuses |
| One live payout attempt | Partial unique index on `PayoutAttempt(withdrawalId)` for PENDING/SUBMITTED/CONFIRMED |
| Maker-checker | `CHECK approvedById <> createdById` (batches, rules) and `confirmedById <> recordedById` (attempts) |
| One referrer / one attribution | Partial unique indexes where `endedAt`/`effectiveTo` IS NULL; `CHECK referrer <> recruit` |
| Device integrity | `Device.serialNumber`, `terminalId`, `orderId` unique; one live activation per device |
| Duplicate merchants | `Merchant.dedupeKey` unique (normalized phone + business name) |

## Migrations
`npm run db:migrate` (production: `prisma migrate deploy`). Create new migrations with
`npm run db:migrate:dev -- --name <change>` and commit the SQL. Never edit an applied migration.
