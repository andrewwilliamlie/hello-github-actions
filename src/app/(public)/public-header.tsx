import Link from "next/link";
import { Button } from "@/components/ui/button";
import { LangToggle } from "@/components/shared/lang-toggle";
import type { Dictionary } from "@/lib/i18n/id";

export function PublicHeader({ t, locale }: { t: Dictionary; locale: "id" | "en" }) {
  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-navy-950/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4">
        <Link href="/" className="flex items-center gap-2.5 text-white">
          <svg viewBox="0 0 32 32" className="size-9" aria-hidden><rect width="32" height="32" rx="9" fill="#59b0ff" /><path d="M9 8v16M23 8v16M9 16h14" stroke="#0b1b42" strokeWidth="3.4" strokeLinecap="round" /></svg>
          <span className="hidden text-sm font-extrabold tracking-tight sm:block">HAUSJO AGENT NETWORK</span>
        </Link>
        <nav className="ml-6 hidden gap-6 text-sm font-medium text-sky-100/80 md:flex" aria-label="Navigasi publik">
          <Link href="/#cara-kerja" className="hover:text-white">{t.landing.nav.how}</Link>
          <Link href="/#produk" className="hover:text-white">{t.landing.nav.products}</Link>
          <Link href="/#penghasilan" className="hover:text-white">{t.landing.nav.earnings}</Link>
          <Link href="/#faq" className="hover:text-white">{t.landing.nav.faq}</Link>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <LangToggle locale={locale} className="text-white hover:bg-white/10 hover:text-white" />
          <Button asChild variant="ghost" className="text-white hover:bg-white/10 hover:text-white"><Link href="/login">{t.landing.nav.login}</Link></Button>
          <Button asChild variant="accent" className="hidden sm:inline-flex"><Link href="/register">{t.landing.nav.cta}</Link></Button>
        </div>
      </div>
    </header>
  );
}

export function PublicFooter({ t }: { t: Dictionary }) {
  return (
    <footer className="border-t bg-navy-950 text-sky-100/70">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 text-sm sm:flex-row sm:items-center sm:justify-between">
        <div>© {new Date().getFullYear()} {t.common.company}. Hausjo Agent Network.</div>
        <div className="flex flex-wrap gap-4">
          <Link href="/terms" className="hover:text-white">{t.landing.terms}</Link>
          <Link href="/privacy" className="hover:text-white">{t.landing.privacy}</Link>
          <Link href="/api-docs" className="hover:text-white">{t.landing.apiDocs}</Link>
        </div>
      </div>
    </footer>
  );
}
