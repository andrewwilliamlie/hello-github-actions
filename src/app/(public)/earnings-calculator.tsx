"use client";
import { useState } from "react";
import { formatRupiah } from "@/lib/money";
import { useI18n } from "@/lib/i18n/client";

/** Illustrative only — not an income guarantee (disclaimer rendered next to it). */
export function EarningsCalculator({ rewardPerTx }: { rewardPerTx: number }) {
  const { t } = useI18n();
  const [merchants, setMerchants] = useState(10);
  const [tx, setTx] = useState(150);
  const total = BigInt(merchants) * BigInt(tx) * BigInt(rewardPerTx);
  return (
    <div className="grid gap-5 rounded-2xl border border-sky-200 bg-white p-6 shadow-sm">
      <label className="grid gap-2 text-sm font-semibold">
        <span className="flex justify-between"><span>{t.landing.calcMerchants}</span><span className="tabular text-navy-700">{merchants}</span></span>
        <input type="range" min={1} max={50} value={merchants} onChange={(e) => setMerchants(Number(e.target.value))} className="accent-navy-800" />
      </label>
      <label className="grid gap-2 text-sm font-semibold">
        <span className="flex justify-between"><span>{t.landing.calcTx}</span><span className="tabular text-navy-700">{tx}</span></span>
        <input type="range" min={10} max={600} step={10} value={tx} onChange={(e) => setTx(Number(e.target.value))} className="accent-navy-800" />
      </label>
      <div className="rounded-xl bg-navy-900 p-4 text-white">
        <div className="text-xs font-bold uppercase tracking-wider text-sky-200">{t.landing.calcResult}</div>
        <div className="mt-1 text-3xl font-extrabold tabular">{formatRupiah(total)}</div>
        <div className="mt-1 text-xs text-sky-100/80">{merchants} × {tx} × {formatRupiah(rewardPerTx)}</div>
      </div>
    </div>
  );
}
