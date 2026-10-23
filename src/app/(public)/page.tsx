import Link from "next/link";
import Image from "next/image";
import { ArrowRight, BadgeCheck, CreditCard, Store, TrendingUp, UserPlus, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getDictionary } from "@/lib/i18n/server";
import { listCatalog } from "@/server/modules/products";
import { prisma } from "@/server/db";
import { formatBps, formatRupiah } from "@/lib/money";
import { EarningsCalculator } from "./earnings-calculator";
import { getSetting } from "@/server/settings";

export const dynamic = "force-dynamic";

async function programTerms() {
  const now = new Date();
  const live = { status: "ACTIVE" as const, effectiveFrom: { lte: now }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }] };
  const [txn, refSales, refTxn] = await Promise.all([
    prisma.commissionRule.findFirst({ where: { ...live, type: "TRANSACTION_REWARD", productId: null, conditions: { equals: {} } }, orderBy: [{ priority: "desc" }, { effectiveFrom: "desc" }] }),
    prisma.commissionRule.findFirst({ where: { ...live, type: "REFERRAL_SALES" }, orderBy: [{ priority: "desc" }, { effectiveFrom: "desc" }] }),
    prisma.commissionRule.findFirst({ where: { ...live, type: "REFERRAL_TRANSACTION" }, orderBy: [{ priority: "desc" }, { effectiveFrom: "desc" }] }),
  ]);
  return { txnReward: txn?.fixedAmount ?? null, refSalesBps: refSales?.rateBps ?? null, refTxnBps: refTxn?.rateBps ?? null };
}

export default async function Landing() {
  const { t } = await getDictionary();
  const L = t.landing;
  const [catalog, terms, min, max] = await Promise.all([listCatalog({ activeOnly: true }), programTerms(), getSetting("sales.commissionMinIdr"), getSetting("sales.commissionMaxIdr")]);
  const stepIcons = [UserPlus, Store, CreditCard, TrendingUp];
  const refLabel = terms.refSalesBps !== null || terms.refTxnBps !== null
    ? [terms.refSalesBps !== null && `${formatBps(terms.refSalesBps)} (penjualan)`, terms.refTxnBps !== null && `${formatBps(terms.refTxnBps)} (transaksi)`].filter(Boolean).join(" · ")
    : "Dapat dikonfigurasi";
  return (
    <main>
      <section className="relative overflow-hidden bg-gradient-to-br from-navy-950 via-navy-900 to-navy-700 text-white">
        <div className="absolute -right-32 -top-32 size-[28rem] rounded-full bg-sky-400/10 blur-3xl" aria-hidden />
        <div className="relative mx-auto grid max-w-6xl gap-10 px-4 py-16 md:grid-cols-[1.2fr_1fr] md:py-24">
          <div>
            <Badge variant="info" className="mb-4 bg-white/10 text-sky-100 ring-white/20">PT Hausjo Digital Pro</Badge>
            <h1 className="text-4xl font-extrabold leading-tight tracking-tight text-balance md:text-5xl">{L.heroTitle}</h1>
            <p className="mt-5 max-w-xl text-lg text-sky-100/90">{L.heroBody}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg" variant="accent"><Link href="/register">{L.heroCta} <ArrowRight /></Link></Button>
              <Button asChild size="lg" variant="outline" className="border-white/30 bg-transparent text-white hover:bg-white/10 hover:text-white"><a href="#cara-kerja">{L.heroSecondary}</a></Button>
            </div>
          </div>
          <div className="grid content-center gap-3">
            {[
              { v: `${formatRupiah(min)}–${formatRupiah(max)}`, l: L.stat1 },
              { v: terms.txnReward !== null ? formatRupiah(terms.txnReward) : "—", l: L.stat2 },
              { v: refLabel, l: L.stat3 },
            ].map((s) => (
              <div key={s.l} className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur">
                <div className="text-2xl font-extrabold tabular text-sky-300">{s.v}</div>
                <div className="mt-1 text-sm text-sky-100/80">{s.l}</div>
              </div>
            ))}
            <p className="text-xs text-sky-100/60">* {L.earningsDisclaimer}</p>
          </div>
        </div>
      </section>

      <section id="cara-kerja" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16">
        <h2 className="text-3xl font-extrabold tracking-tight text-navy-900">{L.howTitle}</h2>
        <ol className="mt-8 grid gap-5 md:grid-cols-4">
          {L.steps.map((s, i) => {
            const Icon = stepIcons[i];
            return (
              <li key={s.t} className="rounded-2xl border bg-card p-5 shadow-sm">
                <div className="flex items-center gap-3">
                  <span className="grid size-10 place-items-center rounded-xl bg-secondary text-navy-800"><Icon className="size-5" /></span>
                  <span className="text-xs font-bold text-muted-foreground">0{i + 1}</span>
                </div>
                <h3 className="mt-4 font-bold">{s.t}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{s.d}</p>
              </li>
            );
          })}
        </ol>
      </section>

      <section id="produk" className="scroll-mt-20 bg-secondary/60 py-16">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="text-3xl font-extrabold tracking-tight text-navy-900">{L.productsTitle}</h2>
          <p className="mt-2 max-w-2xl text-muted-foreground">{L.productsBody}</p>
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {catalog.map((p) => (
              <article key={p.id} className="flex flex-col rounded-2xl border bg-card p-5 shadow-sm">
                {p.imageUrl && <Image src={p.imageUrl} alt={p.name} width={160} height={160} className="mx-auto" />}
                <h3 className="mt-3 text-lg font-bold">{p.name}</h3>
                <p className="mt-1 line-clamp-3 text-sm text-muted-foreground">{p.description}</p>
                <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
                  {(p.specs as { label: string; value: string }[]).slice(0, 3).map((s) => <li key={s.label}><b className="text-foreground">{s.label}:</b> {s.value}</li>)}
                </ul>
                <div className="mt-auto pt-4 text-sm">
                  <span className="text-muted-foreground">{L.commissionLabel}: </span>
                  <b className="text-navy-800">{p.commission !== null ? formatRupiah(p.commission) : L.commissionUnset}</b>
                  {p.commissionRule?.isDemo && <Badge variant="demo" className="ml-2">Demo</Badge>}
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="penghasilan" className="mx-auto grid max-w-6xl scroll-mt-20 gap-8 px-4 py-16 md:grid-cols-2">
        <div>
          <h2 className="text-3xl font-extrabold tracking-tight text-navy-900">{L.earningsTitle}</h2>
          <p className="mt-3 text-muted-foreground">{L.earningsDisclaimer}</p>
          <h3 className="mt-8 flex items-center gap-2 text-lg font-bold"><ShieldCheck className="size-5 text-navy-700" />{L.eligibilityTitle}</h3>
          <ul className="mt-3 space-y-2 text-sm">
            {L.eligibility.map((e) => <li key={e} className="flex gap-2"><BadgeCheck className="mt-0.5 size-4 shrink-0 text-navy-700" />{e}</li>)}
          </ul>
        </div>
        <EarningsCalculator rewardPerTx={Number(terms.txnReward ?? 500n)} />
      </section>

      <section id="faq" className="scroll-mt-20 bg-secondary/60 py-16">
        <div className="mx-auto max-w-3xl px-4">
          <h2 className="text-3xl font-extrabold tracking-tight text-navy-900">{L.faqTitle}</h2>
          <div className="mt-6 divide-y rounded-2xl border bg-card">
            {L.faq.map((f) => (
              <details key={f.q} className="group p-5">
                <summary className="cursor-pointer list-none font-semibold marker:hidden">{f.q}</summary>
                <p className="mt-2 text-sm text-muted-foreground">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16">
        <div className="flex flex-col items-start gap-4 rounded-3xl bg-navy-900 p-8 text-white md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-2xl font-extrabold">{L.ctaTitle}</h2>
            <p className="mt-1 text-sky-100/80">{L.ctaBody}</p>
          </div>
          <Button asChild size="lg" variant="accent"><Link href="/register">{L.heroCta} <ArrowRight /></Link></Button>
        </div>
      </section>
    </main>
  );
}
