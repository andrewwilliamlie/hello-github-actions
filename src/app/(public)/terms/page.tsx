import { AGENT_AGREEMENT_TEXT, AGENT_AGREEMENT_VERSION } from "@/server/modules/agreements";

export const metadata = { title: "Syarat & Ketentuan" };

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-3xl font-extrabold text-navy-900">Perjanjian Kemitraan Agen</h1>
      <p className="mt-1 text-sm text-muted-foreground">Versi {AGENT_AGREEMENT_VERSION}</p>
      <pre className="mt-6 whitespace-pre-wrap rounded-2xl border bg-card p-6 font-sans text-sm leading-relaxed">{AGENT_AGREEMENT_TEXT}</pre>
    </main>
  );
}
