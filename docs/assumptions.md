# Assumptions & configurable defaults

Where the brief left a value or behaviour unspecified, the system uses a **configurable default** and
records it here. Nothing below is hard-coded business policy.

| # | Topic | Default | Where to change |
|---|---|---|---|
| 1 | Per-SKU sales commission | **Not assumed.** Demo seed uses placeholder values inside the Rp50.000–Rp150.000 range, flagged `isDemo` with a dashboard warning | Admin → Aturan komisi (new version + approval) |
| 2 | Allowed sales commission range | Rp50.000 – Rp150.000 | Settings `sales.commissionMinIdr` / `MaxIdr` |
| 3 | Transaction reward | Rp500 per eligible settled transaction (from the brief) | Rule `TXN:DEFAULT` |
| 4 | Referral share % | **Not assumed.** Demo seed uses 10% placeholders (`isDemo`). Without an active rule no referral share is paid | Rules `REFERRAL_SALES`, `REFERRAL_TRANSACTION` |
| 5 | Referral basis | Recruit's eligible **net** commission (after any configured deduction), computed when the recruit's commission becomes ELIGIBLE; floor rounding to whole Rupiah | — (engine) |
| 6 | Referral paid on top or deducted | On top (recruit not reduced) | Rule flag `deductFromRecruit` |
| 7 | Which date selects the sales rule version | Order date | Setting `sales.ruleDateBasis` (`ORDER_DATE` / `ACTIVATION_DATE`) |
| 8 | Refund/fraud review window | 7 days for demo sales rules, 0 for transaction rewards | Rule `holdDays` |
| 9 | Manual approval before payable | Off | Rule `requiresManualApproval` |
| 10 | Minimum withdrawal | Rp100.000 | Setting `withdrawal.minAmountIdr` |
| 11 | Agent approval prerequisites | Phone verified (OTP) + KYC verified; bank verified needed only to withdraw | Setting `agent.requireKycForApproval` |
| 12 | Required merchant documents | Owner KTP + store photo | Setting `merchant.requiredDocuments` |
| 13 | Excluded transaction types | REFUND, VOID, TEST, REVERSAL | Setting `transaction.excludedTypes` + rule conditions |
| 14 | "Settled" definition | Transaction SUCCESS **and** its settlement report reconciled (or accepted with exception) | Setting `reconciliation.requireSettlementReport` |
| 15 | Rewardable period | Device active at the merchant at transaction time **and** merchant attributed to an agent at that time | — |
| 16 | Commission while agent suspended / flagged | Accrued but held (not released) until reactivated / flag cleared | — |
| 17 | Clawback | Reversal takes payable balance first; remainder becomes receivable recovered from future releases; balances never negative | — |
| 18 | Event PAID label | Derived: released valid net − payable − reserved covers the oldest released events (money correctness is in the ledger) | — |
| 19 | One device per order | `quantity = 1`; additional devices = additional orders | — |
| 20 | KYC retention | 1 825 days (5 years) — **legal review required** | Setting `kyc.retentionDays` |
| 21 | Registration abuse limits | 5 registrations / IP / day; referral velocity flag at 10 recruits / day | Settings |
| 22 | Sessions | 12 h absolute, 2 h idle; lockout after 5 failed logins for 15 min | `src/server/auth/*` |
| 23 | Payouts | Manual bank transfer only; a disbursement API adapter interface exists but is not configured | `src/server/payouts/provider.ts` |
| 24 | Merchant portal accounts | Created by Operations with a one-time temporary password | Merchant page |
| 25 | Taxes (PPh) on commissions | **Not implemented** — needs finance/legal decision (see compliance review) | — |
