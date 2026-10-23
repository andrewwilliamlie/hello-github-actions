// Notification templates (Bahasa Indonesia default, English optional). Variables are plain values.
export type TemplateKey =
  | "agent.registered" | "agent.approved" | "agent.rejected" | "agent.suspended" | "admin.agent_registered"
  | "merchant.submitted" | "merchant.approved" | "merchant.revision" | "merchant.rejected" | "merchant.activated"
  | "commission.credited" | "commission.payable" | "commission.reversed" | "referral.earned"
  | "withdrawal.requested" | "withdrawal.approved" | "withdrawal.rejected" | "payout.confirmed" | "payout.failed"
  | "fraud.flagged" | "kyc.verified" | "kyc.rejected" | "bank.verified";

type T = { title: string; body: string };
type Vars = Record<string, string>;

const id: Record<TemplateKey, (v: Vars) => T> = {
  "agent.registered": (v) => ({ title: "Pendaftaran diterima", body: `Halo ${v.name}, pendaftaran Anda sebagai Agen Hausjo sedang ditinjau. Lengkapi checklist onboarding agar proses lebih cepat.` }),
  "agent.approved": (v) => ({ title: "Akun agen disetujui", body: `Selamat ${v.name}! Akun agen ${v.agentCode} aktif. Kode referral Anda: ${v.referralCode}.` }),
  "agent.rejected": (v) => ({ title: "Pendaftaran tidak disetujui", body: `Maaf, pendaftaran Anda tidak disetujui. Alasan: ${v.reason}` }),
  "agent.suspended": (v) => ({ title: "Akun ditangguhkan", body: `Akun agen Anda ditangguhkan. Alasan: ${v.reason}` }),
  "admin.agent_registered": (v) => ({ title: "Pendaftaran agen baru", body: `${v.name} mendaftar sebagai agen dan menunggu peninjauan.` }),
  "merchant.submitted": (v) => ({ title: "Aplikasi merchant masuk", body: `Aplikasi ${v.merchant} dari agen ${v.agent} menunggu peninjauan.` }),
  "merchant.approved": (v) => ({ title: "Merchant disetujui", body: `${v.merchant} disetujui dengan ID ${v.merchantCode}. Langkah berikutnya: verifikasi pembayaran.` }),
  "merchant.revision": (v) => ({ title: "Revisi diperlukan", body: `Aplikasi ${v.merchant} perlu direvisi: ${v.note}` }),
  "merchant.rejected": (v) => ({ title: "Aplikasi merchant ditolak", body: `Aplikasi ${v.merchant} ditolak. Alasan: ${v.reason}` }),
  "merchant.activated": (v) => ({ title: "Perangkat aktif", body: `Perangkat ${v.product} untuk ${v.merchant} telah diaktivasi (TID ${v.terminalId}).` }),
  "commission.credited": (v) => ({ title: "Komisi tercatat", body: `Komisi ${v.amount} untuk ${v.source} tercatat sebagai Tertunda hingga masa tinjauan selesai.` }),
  "commission.payable": (v) => ({ title: "Saldo siap ditarik", body: `${v.amount} telah masuk ke saldo yang dapat ditarik.` }),
  "commission.reversed": (v) => ({ title: "Komisi dibatalkan", body: `Komisi ${v.amount} dibatalkan. Alasan: ${v.reason}` }),
  "referral.earned": (v) => ({ title: "Bagi hasil referral", body: `Anda memperoleh ${v.amount} dari komisi rekrutan langsung ${v.recruit}.` }),
  "withdrawal.requested": (v) => ({ title: "Permintaan penarikan dibuat", body: `Permintaan penarikan ${v.amount} sedang ditinjau tim Finance.` }),
  "withdrawal.approved": (v) => ({ title: "Penarikan disetujui", body: `Penarikan ${v.amount} disetujui dan dijadwalkan untuk transfer.` }),
  "withdrawal.rejected": (v) => ({ title: "Penarikan ditolak", body: `Penarikan ${v.amount} ditolak: ${v.reason}. Saldo dikembalikan.` }),
  "payout.confirmed": (v) => ({ title: "Pembayaran terkonfirmasi", body: `Transfer ${v.amount} ke rekening ${v.bank} telah dikonfirmasi (ref ${v.reference}).` }),
  "payout.failed": (v) => ({ title: "Transfer gagal", body: `Transfer ${v.amount} gagal: ${v.reason}. Tim Finance akan menindaklanjuti.` }),
  "fraud.flagged": (v) => ({ title: "Aktivitas mencurigakan", body: `Tanda risiko ${v.type} (${v.severity}) dibuat untuk ${v.subject}.` }),
  "kyc.verified": () => ({ title: "KYC terverifikasi", body: "Dokumen identitas Anda telah diverifikasi." }),
  "kyc.rejected": (v) => ({ title: "KYC ditolak", body: `Dokumen identitas ditolak: ${v.reason}. Silakan unggah ulang.` }),
  "bank.verified": (v) => ({ title: "Rekening terverifikasi", body: `Rekening ${v.bank} ****${v.last4} telah diverifikasi.` }),
};

const en: Partial<Record<TemplateKey, (v: Vars) => T>> = {
  "agent.approved": (v) => ({ title: "Agent account approved", body: `Congratulations ${v.name}! Agent account ${v.agentCode} is active. Your referral code: ${v.referralCode}.` }),
  "commission.credited": (v) => ({ title: "Commission recorded", body: `Commission ${v.amount} for ${v.source} is recorded as Pending until the review window ends.` }),
  "payout.confirmed": (v) => ({ title: "Payout confirmed", body: `Transfer of ${v.amount} to ${v.bank} confirmed (ref ${v.reference}).` }),
};

export function renderTemplate(key: TemplateKey, vars: Vars, locale = "id"): T {
  const fn = (locale === "en" && en[key]) || id[key];
  return fn(vars);
}
