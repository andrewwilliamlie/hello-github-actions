"use client";
import { useRouter } from "next/navigation";
import { ActionForm } from "@/components/shared/action-form";
import { Field } from "@/components/ui/label";
import { Input, NativeSelect } from "@/components/ui/input";
import { createImportAction } from "../actions";

export function UploadForm() {
  const router = useRouter();
  return (
    <ActionForm action={createImportAction} submitLabel="Unggah & validasi" onSuccess={(d) => router.push(`/admin/imports/${(d as { id: string }).id}`)}>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Jenis data" htmlFor="type"><NativeSelect id="type" name="type"><option value="TRANSACTIONS">Transaksi</option><option value="SETTLEMENTS">Laporan settlement</option><option value="MERCHANT_LEADS">Lead merchant (massal)</option><option value="DEVICES">Perangkat (stok)</option></NativeSelect></Field>
        <Field label="Kode sumber/prosesor" htmlFor="source" hint="Wajib untuk transaksi & settlement"><Input id="source" name="source" className="font-mono uppercase" placeholder="PARTNER_A" /></Field>
        <Field label="Berkas CSV/XLSX" htmlFor="file" hint="Maks. 20 MB / 50.000 baris"><Input id="file" name="file" type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" required /></Field>
      </div>
    </ActionForm>
  );
}
