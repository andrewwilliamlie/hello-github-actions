"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatRupiah } from "@/lib/money";
import { ActionButton } from "@/components/shared/action-button";
import { createBatchAction } from "../actions";

export function BatchBuilder({ items }: { items: { id: string; number: string; agent: string; amount: string; bank: string }[] }) {
  const [sel, setSel] = useState<string[]>([]);
  const router = useRouter();
  const total = items.filter((i) => sel.includes(i.id)).reduce((s, i) => s + BigInt(i.amount), 0n);
  if (!items.length) return <p className="text-sm text-muted-foreground">Tidak ada penarikan disetujui yang menunggu batch.</p>;
  return (
    <div className="grid gap-3">
      <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" className="size-4" checked={sel.length === items.length} onChange={(e) => setSel(e.target.checked ? items.map((i) => i.id) : [])} /> Pilih semua</label>
      <ul className="divide-y rounded-lg border">
        {items.map((i) => (
          <li key={i.id}>
            <label className="flex cursor-pointer flex-wrap items-center gap-3 p-3 text-sm">
              <input type="checkbox" className="size-4" checked={sel.includes(i.id)} onChange={(e) => setSel((s) => (e.target.checked ? [...s, i.id] : s.filter((x) => x !== i.id)))} />
              <span className="font-mono">{i.number}</span><span className="flex-1">{i.agent} · {i.bank}</span><b className="tabular">{formatRupiah(i.amount)}</b>
            </label>
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm">{sel.length} dipilih · <b>{formatRupiah(total)}</b></span>
        <ActionButton action={createBatchAction} args={{ ids: sel.join(",") }} label="Buat batch pembayaran" disabled={!sel.length} variant="default" confirmTitle="Buat batch?" confirmBody="Batch harus disetujui oleh pengguna Finance lain sebelum transfer." reason={{ label: "Catatan batch (opsional)" }} onDone={(d) => router.push(`/admin/payouts/${(d as { id: string }).id}`)} />
      </div>
    </div>
  );
}
