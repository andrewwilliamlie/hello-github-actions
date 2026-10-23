import { PRIVACY_VERSION } from "@/server/modules/agreements";

export const metadata = { title: "Kebijakan Privasi" };

const sections = [
  ["Data yang kami kumpulkan", "Nama, nomor ponsel, email, alamat, data rekening bank, nomor dan foto KTP, foto selfie, data merchant yang Anda daftarkan, serta log aktivitas akun."],
  ["Tujuan pemrosesan", "Verifikasi identitas (KYC), pencegahan fraud dan duplikasi akun, perhitungan dan pembayaran komisi, kepatuhan hukum dan perpajakan, serta komunikasi layanan."],
  ["Dasar pemrosesan", "Persetujuan Anda dan pelaksanaan perjanjian kemitraan, sesuai UU No. 27 Tahun 2022 tentang Pelindungan Data Pribadi."],
  ["Keamanan", "Nomor KTP dan rekening dienkripsi (AES-256-GCM). Dokumen identitas disimpan dengan akses terbatas dan setiap akses tercatat dalam log audit."],
  ["Retensi", "Dokumen KYC disimpan selama periode retensi yang dikonfigurasi (bawaan 5 tahun) lalu dihapus, kecuali diwajibkan lain oleh hukum."],
  ["Hak Anda", "Anda berhak mengakses, memperbaiki, dan meminta penghapusan data, serta menarik persetujuan WhatsApp/pemasaran kapan saja melalui profil atau dukungan Hausjo."],
  ["WhatsApp", "Kami hanya mengirim pesan WhatsApp melalui penyedia resmi, menggunakan templat yang disetujui, dan hanya jika Anda memberikan persetujuan."],
];

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-3xl font-extrabold text-navy-900">Kebijakan Privasi</h1>
      <p className="mt-1 text-sm text-muted-foreground">Versi {PRIVACY_VERSION} · [DRAFT — wajib ditinjau penasihat hukum]</p>
      <div className="mt-6 space-y-5">
        {sections.map(([h, b]) => (
          <section key={h} className="rounded-2xl border bg-card p-5">
            <h2 className="font-bold">{h}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{b}</p>
          </section>
        ))}
      </div>
    </main>
  );
}
