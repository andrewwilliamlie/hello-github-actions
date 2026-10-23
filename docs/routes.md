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
| `/agent/earnings` | Commission events with filters + explanation drawer |
| `/agent/wallet` | Pending / payable / reserved / paid balances, withdrawals, statement download |
| `/agent/referrals` | Referral code/link (copy, WhatsApp share), direct recruits, network tree |
| `/agent/notifications` | Notification centre |
| `/agent/profile` | Profile, language, WhatsApp opt-in, password |

## Admin portal (`SUPER_ADMIN`, `FINANCE_ADMIN`, `OPERATIONS_ADMIN` — items hidden without permission)
| Path | Permission |
|---|---|
| `/admin` | `report.view` |
| `/admin/agents`, `/admin/agents/[id]` | `agent.view` / `agent.approve`, `kyc.review` |
| `/admin/referrals` | `agent.view` (network, referrer reassignment needs `referral.reassign`) |
| `/admin/merchants` (leads queue + merchants), `/admin/merchants/[id]`, `/admin/leads/[id]` | `merchant.view` / `merchant.review` |
| `/admin/orders` | `order.view` / `payment.verify` |
| `/admin/inventory` | `device.manage` |
| `/admin/products`, `/admin/products/[id]` | `product.manage` |
| `/admin/rules` | `rule.manage` / `rule.approve` |
| `/admin/transactions` | `transaction.view` |
| `/admin/imports`, `/admin/imports/[id]` | `import.manage` |
| `/admin/reconciliation` | `reconciliation.manage` |
| `/admin/commissions` | `commission.view` / `commission.approve` / `commission.reverse` |
| `/admin/withdrawals` | `withdrawal.review` |
| `/admin/payouts`, `/admin/payouts/[id]` | `payout.create` / `payout.approve` / `payout.record` / `payout.confirm` |
| `/admin/disputes`, `/admin/fraud` | `dispute.manage`, `fraud.manage` |
| `/admin/reports` | `report.export` |
| `/admin/notifications` | `notification.outbox` (mock deliveries, templates) |
| `/admin/webhooks` | `webhook.manage` (dead letter replay, API clients) |
| `/admin/audit` | `audit.view` |
| `/admin/settings`, `/admin/users` | `settings.manage`, `user.manage` |

## Merchant portal (`MERCHANT`)
| `/merchant` | Onboarding status timeline, devices, transaction history |

## REST API `/api/v1` (OpenAPI: `/api/v1/openapi.json`)
Session-cookie auth for portal users; `X-Api-Key` for partner integrations; HMAC-signed webhooks.
See `docs/api.md` for the full list.
