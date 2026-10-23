import Link from "next/link";
import { pageContext } from "@/server/page-auth";
import { prisma } from "@/server/db";
import { getDictionary } from "@/lib/i18n/server";
import { formatRupiah } from "@/lib/money";
import { businessDateString, parseDateOnly, startOfJakartaDay, formatDateTime } from "@/lib/time";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PrintButton } from "./print-button";

export const metadata = { title: "Struk laporan" };

/** Monthly statement styled as an EDC thermal receipt (reference artifact pattern). */
export default async function ReceiptPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const { actor } = await pageContext("agent");
  const { t, locale } = await getDictionary();
  const sp = await searchParams;
  const month = sp.month && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : businessDateString(new Date()).slice(0, 7);
  const [y, m] = month.split("-").map(Number);
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  const agent = await prisma.agent.findUniqueOrThrow({ where: { id: actor.agentId! }, include: { wallet: true } });
  const [byType, reversed, paid] = await Promise.all([
    prisma.commissionEvent.groupBy({ by: ["type"], where: { agentId: agent.id, status: { not: "REVERSED" }, businessDate: { gte: parseDateOnly(`${month}-01`), lt: parseDateOnly(`${next}-01`) } }, _sum: { amount: true, deductedAmount: true }, _count: true }),
    prisma.commissionEvent.aggregate({ where: { agentId: agent.id, reversedAt: { gte: startOfJakartaDay(`${month}-01`), lt: startOfJakartaDay(`${next}-01`) } }, _sum: { amount: true }, _count: true }),
    prisma.withdrawalRequest.aggregate({ where: { agentId: agent.id, status: "PAID", paidAt: { gte: startOfJakartaDay(`${month}-01`), lt: startOfJakartaDay(`${next}-01`) } }, _sum: { amount: true }, _count: true }),
  ]);
  const line = (type: string) => {
    const r = byType.find((x) => x.type === type);
    return { n: r?._count ?? 0, amt: (r?._sum.amount ?? 0n) - (r?._sum.deductedAmount ?? 0n) };
  };
  const total = byType.reduce((s, r) => s + (r._sum.amount ?? 0n) - (r._sum.deductedAmount ?? 0n), 0n);
  const label = new Date(`${month}-01T00:00:00Z`).toLocaleDateString(locale === "en" ? "en-GB" : "id-ID", { month: "long", year: "numeric", timeZone: "UTC" });
  return (
    <div className="mx-auto max-w-sm">
      <div className="no-print mb-4 flex flex-wrap items-end gap-2">
        <form className="flex items-end gap-2"><label className="grid gap-1 text-xs font-semibold">Bulan<Input type="month" name="month" defaultValue={month} /></label><Button type="submit" variant="outline">{t.common.apply}</Button></form>
        <PrintButton />
        <Button asChild variant="ghost"><Link href="/agent/wallet">{t.common.back}</Link></Button>
      </div>
      <div className="receipt rounded-sm p-5 pb-8 text-[13px] text-neutral-800 shadow">
        <div className="text-center font-semibold">HAUSJO AGENT NETWORK</div>
        <div className="text-center">LAPORAN AGEN · {label.toUpperCase()}</div>
        <hr className="my-2 border-dashed border-neutral-400" />
        <div className="flex justify-between"><span>{agent.fullName}</span><span>{agent.agentCode}</span></div>
        <hr className="my-2 border-dashed border-neutral-400" />
        {(["SALES", "TRANSACTION_REWARD", "REFERRAL_SALES", "REFERRAL_TRANSACTION"] as const).map((ty) => (
          <div key={ty} className="flex justify-between gap-2"><span>{t.commissionType[ty]} ×{line(ty).n}</span><span>{formatRupiah(line(ty).amt)}</span></div>
        ))}
        <hr className="my-2 border-dashed border-neutral-400" />
        <div className="flex justify-between text-[15px] font-semibold"><span>TOTAL</span><span>{formatRupiah(total)}</span></div>
        <div className="flex justify-between"><span>Dibatalkan ×{reversed._count}</span><span>-{formatRupiah(reversed._sum.amount ?? 0n)}</span></div>
        <div className="flex justify-between"><span>Dibayar ×{paid._count}</span><span>{formatRupiah(paid._sum.amount ?? 0n)}</span></div>
        <hr className="my-2 border-dashed border-neutral-400" />
        <div className="flex justify-between"><span>Saldo tertunda</span><span>{formatRupiah(agent.wallet!.pendingBalance)}</span></div>
        <div className="flex justify-between"><span>Saldo dapat ditarik</span><span>{formatRupiah(agent.wallet!.payableBalance)}</span></div>
        <div className="mt-3 text-center text-[11px]">Dicetak {formatDateTime(new Date(), locale)}</div>
        <div className="text-center text-[11px]">*** BUKAN BUKTI TRANSFER ***</div>
      </div>
    </div>
  );
}
