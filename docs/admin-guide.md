# Admin operating guide

All admin roles sign in with password + TOTP. Every action is written to the immutable audit log
(Admin → Log audit). Buttons you lack permission for are hidden; the server refuses them anyway.

## Roles
| Role | Owns |
|---|---|
| **Super Admin** | Everything, incl. settings, users, commission-rule approval, attribution/referrer changes |
| **Finance Admin** | Commissions (approve/reverse/release), reconciliation, imports, withdrawals, payout batches, reports |
| **Operations Admin** | Agent KYC/approval/suspension, bank verification, merchant review, payments, devices, disputes, fraud |

## Daily routine
1. **Dashboard** — check open withdrawals, fraud flags, reconciliation exceptions, demo-rule warning.
2. **Antrean aplikasi** (Ops) — oldest first. *Mulai tinjau* → check documents (KTP pemilik, foto usaha),
   duplicate warning, location → *Setujui merchant* / *Minta revisi* (agent sees the note) / *Tolak*.
3. **Agents** (Ops) — filter KYC = menunggu. Open the KTP & selfie (access is audited), compare with
   name/NIK → *Verifikasi KTP*. Verify the bank account holder name → *Verifikasi*. Then *Setujui agen*
   (requires verified KYC). Approval activates the agent's referral link.
4. **Orders / merchant page** (Ops/Finance) — *Verifikasi* payment only after funds are visible in the
   Hausjo account (reference must be unique). *Tetapkan perangkat* (only in-stock devices of the ordered
   SKU). *Aktivasi* with the processor's Terminal ID → the sales commission is recorded as **Pending**.
5. **Rekonsiliasi** (Finance) — runs automatically at 02:00 WIB for the previous day; *Jalankan* to rerun
   (safe/idempotent). Work the exception queue:
   * `UNMATCHED_TERMINAL` — activate the device with that TID, then *Coba cocokkan ulang*; or *Abaikan* if bad data.
   * `SETTLEMENT_MISMATCH` — confirm with the processor; *Terima dengan pengecualian* only with evidence.
   * `MISSING_SETTLEMENT` — wait for/import the settlement report.
   * `STATUS_CONFLICT` — processor sent contradictory data; investigate with them.
6. **Komisi** (Finance) — commission release runs every 15 minutes; *Jalankan rilis sekarang* if needed.
   If a rule requires manual approval, approve the ELIGIBLE items. Open any commission to see source,
   rate, rule version, formula and ledger trail.
7. **Penarikan** (Finance) — *Setujui* or *Tolak* (funds return to the agent). Select approved items →
   *Buat batch pembayaran* (you are the **maker**).

## Payout procedure (maker-checker)
1. Maker creates the batch. 2. A **different** Finance/Super Admin approves it (checker).
3. Download *Instruksi transfer (CSV)* (account numbers are decrypted only in this file — handle as
   confidential, delete after use). 4. Execute transfers in the bank portal.
5. For each item: *Catat transfer* with the bank reference (+ proof PDF/image).
6. A **different** user than the recorder checks the bank statement and clicks *Konfirmasi dengan mutasi
   bank* → withdrawal **Dibayar**, agent notified. Never confirm without seeing the debit.
7. Failed transfer → *Tandai gagal* → *Coba lagi* (new attempt) or *Kembalikan dana ke agen*.

## Refunds, fraud and disputes
* **Refund** an order from the merchant page: payment refunded, device back to stock, commission
  reversed. If the agent was already paid, the amount becomes **clawback** and is recovered
  automatically from their next releases.
* **Manual reversal** (Komisi → detail → *Batalkan / clawback*) for fraud; referral shares derived from
  it are reversed automatically.
* **Fraud flags** (automatic: shared bank account, duplicate NIK, referral velocity, self-referral
  signals). Open MEDIUM/HIGH flags and any CONFIRMED flag hold the related commissions. *Bersihkan* or
  *Konfirmasi fraud*, then suspend the agent and reverse commissions where appropriate.
* **Disputes** — pending commissions are frozen while open; resolve as *Komisi sah*, *Batalkan komisi* or *Tolak*.

## Configuration (Super Admin)
* **Aturan komisi** — never edit; create a *Versi baru* with an effective date, *Ajukan*, then a second
  person approves. The previous open version closes automatically at the new start date. Sales rules
  are per SKU and must be within the configured Rp50.000–Rp150.000 range. Referral % are set here
  (separate rules for sales and transaction shares). Replace all **DEMO** rules before go-live.
* **Pengaturan** — minimum withdrawal, hold/retention defaults, required merchant documents, excluded
  transaction types, fraud thresholds, WhatsApp enablement.
* **Atribusi / referrer** changes — Super Admin only, reason required, not retroactive.
* **Pengguna admin** — create users, change roles, reset MFA, disable accounts.
* **Integrasi** — create API clients per processor (key + webhook secret shown once), revoke keys,
  replay dead-lettered webhooks, watch job queue health.

## Imports
Impor data → choose type (Transaksi, Settlement, Lead merchant, Perangkat), source code for
transactions/settlements → upload CSV/XLSX → review the preview (valid / invalid / duplicate) →
*Terapkan*. Download the error report CSV for rejected rows. Re-uploading the same file is safe.
Templates are linked on the page.
