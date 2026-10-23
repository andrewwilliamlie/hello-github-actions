"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { createRuleAction } from "../actions";

type Type = "SALES" | "TRANSACTION_REWARD" | "REFERRAL_SALES" | "REFERRAL_TRANSACTION";

export function RuleForm({ products, defaults, range }: { products: { id: string; name: string; sku: string }[]; defaults?: Record<string, string>; range: { min: number; max: number } }) {
  const [type, setType] = useState<Type>((defaults?.type as Type) ?? "SALES");
  const [pending, start] = useTransition();
  const router = useRouter();
  const d = defaults ?? {};
  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const v = (k: string) => String(f.get(k) ?? "");
        start(async () => {
          const res = await createRuleAction({
            code: v("code"), type, name: v("name"), description: v("description"), productId: v("productId"), fixedAmount: v("fixedAmount"), ratePercent: v("ratePercent"), capAmount: v("capAmount"),
            transactionTypes: v("transactionTypes"), sources: v("sources"), merchantIds: v("merchantIds"), excludeMerchantIds: v("excludeMerchantIds"), minTransactionAmount: v("minTransactionAmount"),
            priority: v("priority") || "0", effectiveFrom: v("effectiveFrom"), effectiveTo: v("effectiveTo"), holdDays: v("holdDays") || "0",
            requiresManualApproval: f.get("requiresManualApproval") === "on", deductFromRecruit: f.get("deductFromRecruit") === "on",
          });
          if (res.ok) {
            toast.success(res.message ?? "OK");
            router.push("/admin/rules");
            router.refresh();
          } else toast.error(res.error);
        });
      }}
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Jenis" htmlFor="type">
          <NativeSelect id="type" value={type} onChange={(e) => setType(e.target.value as Type)}>
            <option value="SALES">Komisi penjualan (per SKU)</option><option value="TRANSACTION_REWARD">Imbalan transaksi</option>
            <option value="REFERRAL_SALES">Referral — penjualan</option><option value="REFERRAL_TRANSACTION">Referral — transaksi</option>
          </NativeSelect>
        </Field>
        <Field label="Kode aturan (keluarga versi)" htmlFor="code" hint="Kode yang sama = versi baru"><Input id="code" name="code" defaultValue={d.code} required className="font-mono uppercase" /></Field>
        <Field label="Nama" htmlFor="name"><Input id="name" name="name" defaultValue={d.name} required /></Field>
      </div>
      {type === "SALES" && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Produk (SKU)" htmlFor="productId"><NativeSelect id="productId" name="productId" defaultValue={d.productId} required>{products.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}</NativeSelect></Field>
          <Field label="Komisi tetap (Rp)" htmlFor="fixedAmount" hint={`Rentang aturan bisnis: Rp${range.min.toLocaleString("id-ID")}–Rp${range.max.toLocaleString("id-ID")}`}><Input id="fixedAmount" name="fixedAmount" inputMode="numeric" defaultValue={d.fixedAmount} required /></Field>
        </div>
      )}
      {type === "TRANSACTION_REWARD" && (
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Imbalan per transaksi (Rp)" htmlFor="fixedAmount"><Input id="fixedAmount" name="fixedAmount" inputMode="numeric" defaultValue={d.fixedAmount ?? "500"} required /></Field>
          <Field label="Jenis transaksi (koma)" htmlFor="transactionTypes" hint="Kosong = semua kecuali yang dikecualikan"><Input id="transactionTypes" name="transactionTypes" defaultValue={d.transactionTypes} placeholder="PURCHASE, QRIS" /></Field>
          <Field label="Sumber/mitra (koma)" htmlFor="sources"><Input id="sources" name="sources" defaultValue={d.sources} placeholder="PARTNER_A" /></Field>
          <Field label="Hanya merchant ID (koma)" htmlFor="merchantIds"><Input id="merchantIds" name="merchantIds" defaultValue={d.merchantIds} /></Field>
          <Field label="Kecualikan merchant ID (koma)" htmlFor="excludeMerchantIds"><Input id="excludeMerchantIds" name="excludeMerchantIds" defaultValue={d.excludeMerchantIds} /></Field>
          <Field label="Nominal transaksi minimum (Rp)" htmlFor="minTransactionAmount"><Input id="minTransactionAmount" name="minTransactionAmount" inputMode="numeric" defaultValue={d.minTransactionAmount} /></Field>
        </div>
      )}
      {type.startsWith("REFERRAL") && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Persentase dari komisi bersih rekrutan (%)" htmlFor="ratePercent" hint="Maks. 2 desimal, mis. 10 atau 2.5"><Input id="ratePercent" name="ratePercent" inputMode="decimal" defaultValue={d.ratePercent} required /></Field>
          <label className="mt-6 flex items-start gap-2 text-sm"><input type="checkbox" name="deductFromRecruit" defaultChecked={d.deductFromRecruit === "true"} className="mt-0.5 size-4" /> Potong dari komisi rekrutan (bawaan: tidak — referrer dibayar sebagai tambahan)</label>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-4">
        <Field label="Berlaku mulai" htmlFor="effectiveFrom"><Input id="effectiveFrom" name="effectiveFrom" type="datetime-local" defaultValue={d.effectiveFrom} required /></Field>
        <Field label="Berlaku sampai (opsional)" htmlFor="effectiveTo"><Input id="effectiveTo" name="effectiveTo" type="datetime-local" defaultValue={d.effectiveTo} /></Field>
        <Field label="Masa tinjauan (hari)" htmlFor="holdDays" hint="Jendela refund/fraud"><Input id="holdDays" name="holdDays" type="number" min={0} max={180} defaultValue={d.holdDays ?? (type === "SALES" ? "7" : "0")} /></Field>
        <Field label="Prioritas" htmlFor="priority"><Input id="priority" name="priority" type="number" defaultValue={d.priority ?? "0"} /></Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Batas per komisi (Rp, opsional)" htmlFor="capAmount"><Input id="capAmount" name="capAmount" inputMode="numeric" defaultValue={d.capAmount} /></Field>
        <label className="mt-6 flex items-center gap-2 text-sm"><input type="checkbox" name="requiresManualApproval" defaultChecked={d.requiresManualApproval === "true"} className="size-4" /> Wajib disetujui Finance sebelum dapat ditarik</label>
      </div>
      <Field label="Deskripsi / dasar keputusan" htmlFor="description"><Textarea id="description" name="description" defaultValue={d.description} /></Field>
      <div><Button type="submit" disabled={pending}>{pending && <Loader2 className="animate-spin" />}Simpan sebagai draf</Button></div>
    </form>
  );
}
