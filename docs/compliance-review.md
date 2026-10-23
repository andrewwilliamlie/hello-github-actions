# Compliance items for legal review (Indonesia)

This MVP applies privacy-by-design and financial-control principles, but the following must be
reviewed by qualified counsel / compliance before go-live. Nothing here is legal advice.

## Personal data protection — UU No. 27 Tahun 2022 (PDP)
* Lawful basis & consent wording for KTP/selfie/bank data processing (registration consents are
  versioned and stored; text in `src/lib/i18n/id.ts` and `/privacy` is a **draft**).
* Data controller/processor roles with payment processors, cloud and messaging providers; DPA contracts.
* Retention periods for KYC and financial data (`kyc.retentionDays` default 5 years is an assumption).
* Data-subject rights handling (access, correction, deletion, consent withdrawal) — currently via support;
  define SLA and procedure.
* Breach notification procedure (3 × 24 hours to data subjects/authority) and DPO appointment.
* Cross-border transfer if storage/compute is outside Indonesia (choose `ap-southeast-3` Jakarta region).

## Payments & agent regulation
* Whether agent activities (selling EDC, onboarding merchants) fall under Bank Indonesia / OJK rules for
  payment-system agents or Laku Pandai/branchless banking; partner PJP obligations and merchant KYC (KYM)
  standards for QRIS/EDC acquiring.
* Merchant onboarding data and document requirements as mandated by the acquiring partner.
* Use of a licensed disbursement provider before automating payouts.

## Consumer protection & marketing
* Recruitment page: earnings shown as **illustrative** with disclaimers, no income guarantees, no
  sign-up/recruitment rewards, single-level referral share only. Confirm the referral program is not
  characterised as a pyramid/multi-level scheme under UU No. 7/2014 (Perdagangan) and Permendag on
  direct selling.
* Agent Partnership Agreement (`src/server/modules/agreements.ts`) is a **draft**.

## Tax
* Withholding tax on agent commissions (PPh 21 for individuals / PPh 23), NPWP collection, monthly
  bukti potong. Not implemented — requires finance decision; the ledger supports adding withholding journals.

## Messaging
* WhatsApp Business Policy: only approved templates, opt-in recorded per user (implemented), opt-out
  honoured; provider must be an official BSP/Cloud API.
* SMS OTP provider contract and sender ID registration.

## Records
* Retention of financial records (UU KUP: 10 years) — ledger/audit tables are append-only; confirm
  archival strategy.
