import { createHash } from "node:crypto";

/** Versioned agent agreement. Changing the text requires a new version (agents re-accept). */
export const AGENT_AGREEMENT_VERSION = "2026-10-v1";
export const PRIVACY_VERSION = "2026-10-v1";

export const AGENT_AGREEMENT_TEXT = `PERJANJIAN KEMITRAAN AGEN HAUSJO (versi ${AGENT_AGREEMENT_VERSION})

1. Agen adalah mitra independen PT Hausjo Digital Pro, bukan karyawan.
2. Agen memperoleh komisi penjualan per perangkat yang memenuhi syarat (pembayaran terverifikasi, onboarding disetujui, perangkat aktif, dan masa tinjauan pengembalian/fraud selesai) sesuai aturan komisi yang berlaku pada tanggal penjualan.
3. Agen memperoleh imbalan per transaksi merchant yang berhasil dan telah settle, dari merchant yang diatribusikan kepada agen, sesuai aturan yang berlaku.
4. Bagi hasil referral hanya dibayarkan dari komisi bersih yang memenuhi syarat milik agen rekrutan langsung. Tidak ada imbalan untuk pendaftaran atau rekrutmen semata.
5. Tidak ada jaminan penghasilan. Contoh penghasilan bersifat ilustratif.
6. Komisi dapat dibatalkan atau ditarik kembali (clawback) jika terjadi pengembalian dana, transaksi dibatalkan, atau kecurangan.
7. Agen wajib menjaga kerahasiaan data merchant dan mematuhi UU No. 27 Tahun 2022 tentang Pelindungan Data Pribadi.
8. Penarikan dana hanya ke rekening atas nama agen yang telah diverifikasi.
9. PT Hausjo Digital Pro dapat menangguhkan akun yang melanggar ketentuan.
[DRAFT — wajib ditinjau oleh penasihat hukum sebelum digunakan]`;

export function agreementHash(text = AGENT_AGREEMENT_TEXT) {
  return createHash("sha256").update(text).digest("hex");
}
