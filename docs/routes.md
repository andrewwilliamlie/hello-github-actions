# Route map

## Public
| Path | Purpose |
|---|---|
| `/` | Recruitment landing page (how it works, products, eligibility, illustrative earnings, FAQ, CTA) |
| `/register` | Agent self-registration (OTP, consents, optional referral code) |
| `/r/[code]` | Referral link → `/register?ref=CODE` |
| `/login`, `/login/mfa`, `/login/mfa/setup` | Sign-in, admin TOTP verification / enrolment |
| `/terms`, `/privacy` | Agent agreement & privacy notice (versioned) |
| `/api-docs` | Rendered OpenAPI specification |

## Agent portal (`AGENT`)
| Path | Purpose |
|---|---|
| `/agent` | Dashboard: KPIs, trends, rankings, activity, referral share box |
| `/agent/onboarding` | Checklist: profile, KYC upload, bank account, agreement |
| `/agent/merchants`, `/agent/merchants/new`, `/agent/merchants/[id]` | Own leads/merchants, create lead, documents, submit, payment proof |
| `/agent/earnings`, `/agent/earnings/[id]` | Commission events with filters + explanation (source, rate, rule version, ledger) |
| `/agent/wallet`, `/agent/wallet/statement`, `/agent/wallet/receipt` | Balances, withdrawals, CSV statement, printable receipt-style statement |
| `/agent/referrals` | Referral code/link (copy, WhatsApp share), direct recruits, network tree |
| `/agent/notifications` | Notification centre |
| `/agent/profile` | Profile, language, WhatsApp opt-in, password |

## Admin portal (`SUPER_ADMIN`, `FINANCE_ADMIN`, `OPERATIONS_ADMIN` — items hidden without permission)
| Path | Permission |
|---|---|
| `/admin` | `report.view` |
| `/admin/agents`, `/admin/agents/[id]` | `agent.view` / `agent.approve`, `kyc.review` |
| `/admin/referrals` | `agent.view` (network, referrer reassignment needs `referral.reassign`) |
| `/admin/leads`, `/admin/leads/[id]` (application queue) | `merchant.view` / `merchant.review` |
| `/admin/merchants`, `/admin/merchants/[id]` (payments, device assignment, activation, refund, attribution, portal login) | `merchant.view` + action permissions |
| `/admin/orders` | `order.view` / `payment.verify` |
| `/admin/inventory` | `device.manage` |
| `/admin/products`, `/admin/products/[id]`, `/admin/products/new` | `product.manage` |
| `/admin/rules` | `rule.manage` / `rule.approve` |
| `/admin/transactions` | `transaction.view` |
| `/admin/imports`, `/admin/imports/[id]` (+ `/errors` CSV, `/admin/imports/template`) | `import.manage` |
| `/admin/reconciliation` | `reconciliation.manage` |
| `/admin/commissions`, `/admin/commissions/[id]` | `commission.view` / `commission.approve` / `commission.reverse` / `commission.release` |
| `/admin/withdrawals` | `withdrawal.review` |
| `/admin/payouts`, `/admin/payouts/[id]` (+ `/instructions` CSV) | `payout.create` / `payout.approve` / `payout.record` / `payout.confirm` / `payout.export` |
| `/admin/disputes`, `/admin/fraud` | `dispute.manage`, `fraud.manage` |
| `/admin/reports` (+ `/admin/reports/export`) | `report.export` |
| `/admin/notifications` | `notification.outbox` (mock deliveries, templates) |
| `/admin/integrations` | `webhook.manage` (API clients, webhook dead-letter replay, job queue) |
| `/admin/audit` | `audit.view` |
| `/admin/settings`, `/admin/users` | `settings.manage`, `user.manage` |
| `/admin/inbox`, `/admin/search` | any admin (own notifications; search limited by permissions) |

## Merchant portal (`MERCHANT`)
| Path | Purpose |
|---|---|
| `/merchant` | Onboarding status timeline, devices, transaction history |

## Other routes
| Path | Purpose |
|---|---|
| `/api/files/[id]` | Authorized file download (restricted access audited) |
| `/api/health` | Health check |

## REST API `/api/v1` (OpenAPI: `/api/v1/openapi.json`)
Session-cookie auth for portal users; `X-Api-Key` for partner integrations; HMAC-signed webhooks.
See `docs/api.md` for the full list.
