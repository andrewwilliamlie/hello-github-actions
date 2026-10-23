"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { formatRupiah } from "@/lib/money";
import { requestWithdrawalAction } from "../actions";

/** The idempotency key is created once per form instance, so double-clicks/retries never create two withdrawals. */
export function WithdrawForm({ payable, min, disabledReason }: { payable: string; min: string; disabledReason?: string }) {
  const [key, setKey] = useState(() => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`.replace(".", "")));
  const [amount, setAmount] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const canWithdraw = !disabledReason && BigInt(payable) >= BigInt(min);
  return (
    <form
      className="grid gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData();
        fd.set("amount", amount.replace(/\D/g, ""));
        fd.set("idempotencyKey", key);
        start(async () => {
          const res = await requestWithdrawalAction(fd);
          if (res.ok) {
            toast.success(res.message ?? "OK");
            setAmount("");
            setKey(crypto.randomUUID());
            router.refresh();
          } else toast.error(res.error);
        });
      }}
    >
      <Field label="Jumlah penarikan (Rp)" htmlFor="amount" hint={`Minimal ${formatRupiah(min)} · tersedia ${formatRupiah(payable)}`}>
        <Input id="amount" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={min} required disabled={!canWithdraw} />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" disabled={!canWithdraw} onClick={() => setAmount(payable)}>Tarik semua</Button>
        <Button type="submit" disabled={pending || !canWithdraw}>{pending && <Loader2 className="animate-spin" />}Ajukan penarikan</Button>
      </div>
      {disabledReason && <p className="text-xs text-muted-foreground">{disabledReason}</p>}
    </form>
  );
}
