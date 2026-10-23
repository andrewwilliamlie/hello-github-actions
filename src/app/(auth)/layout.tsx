import Link from "next/link";
import { getDictionary } from "@/lib/i18n/server";
import { LangToggle } from "@/components/shared/lang-toggle";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const { locale } = await getDictionary();
  return (
    <div className="min-h-screen bg-gradient-to-br from-navy-950 via-navy-900 to-navy-700">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5">
        <Link href="/" className="flex items-center gap-2.5 text-white">
          <svg viewBox="0 0 32 32" className="size-9" aria-hidden><rect width="32" height="32" rx="9" fill="#59b0ff" /><path d="M9 8v16M23 8v16M9 16h14" stroke="#0b1b42" strokeWidth="3.4" strokeLinecap="round" /></svg>
          <span className="text-sm font-extrabold tracking-tight">HAUSJO AGENT NETWORK</span>
        </Link>
        <LangToggle locale={locale} className="text-white hover:bg-white/10 hover:text-white" />
      </header>
      <main className="mx-auto max-w-6xl px-4 pb-16">{children}</main>
    </div>
  );
}
