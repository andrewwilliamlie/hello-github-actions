"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { PROVINCES } from "@/lib/regions";
import { normalizePhone } from "@/lib/utils";
import { createLeadAction, updateLeadAction } from "../actions";

const schema = z.object({
  businessName: z.string().trim().min(2, "Wajib diisi"),
  ownerName: z.string().trim().min(2, "Wajib diisi"),
  phone: z.string().refine((v) => !!normalizePhone(v), "Nomor ponsel tidak valid"),
  email: z.string().email("Email tidak valid").or(z.literal("")),
  businessType: z.string().trim().min(2, "Wajib diisi"),
  addressLine: z.string().trim().min(5, "Alamat terlalu pendek"),
  city: z.string().trim().min(2, "Wajib diisi"),
  province: z.string().min(2, "Pilih provinsi"),
  postalCode: z.string().regex(/^(\d{5})?$/, "Kode pos 5 digit"),
  latitude: z.string().optional(),
  longitude: z.string().optional(),
  productId: z.string().min(1, "Pilih produk"),
  notes: z.string().max(1000).optional(),
});
type Values = z.infer<typeof schema>;

export function LeadForm({ products, leadId, defaults }: { products: { id: string; name: string }[]; leadId?: string; defaults?: Partial<Values> }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const { register, handleSubmit, setValue, formState: { errors } } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { email: "", postalCode: "", province: "", productId: "", ...defaults } });
  const e = (k: keyof Values) => errors[k]?.message;
  const onSubmit = (v: Values) =>
    start(async () => {
      const res = leadId ? await updateLeadAction(leadId, v) : await createLeadAction(v);
      if (!res.ok) return void toast.error(res.error);
      toast.success(res.message ?? "Tersimpan");
      router.push(`/agent/merchants/${(res.data as { id: string }).id}`);
      router.refresh();
    });
  const locate = () =>
    navigator.geolocation?.getCurrentPosition(
      (p) => {
        setValue("latitude", p.coords.latitude.toFixed(6));
        setValue("longitude", p.coords.longitude.toFixed(6));
        toast.success("Lokasi diisi");
      },
      () => toast.error("Tidak dapat mengambil lokasi"),
    );
  return (
    <form onSubmit={handleSubmit(onSubmit)} className="grid gap-5" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nama usaha" htmlFor="businessName" error={e("businessName")}><Input id="businessName" {...register("businessName")} aria-invalid={!!errors.businessName} /></Field>
        <Field label="Jenis usaha" htmlFor="businessType" error={e("businessType")}><Input id="businessType" placeholder="Warung, apotek, kafe…" {...register("businessType")} aria-invalid={!!errors.businessType} /></Field>
        <Field label="Nama pemilik" htmlFor="ownerName" error={e("ownerName")}><Input id="ownerName" {...register("ownerName")} aria-invalid={!!errors.ownerName} /></Field>
        <Field label="Nomor ponsel pemilik" htmlFor="phone" error={e("phone")}><Input id="phone" inputMode="tel" {...register("phone")} aria-invalid={!!errors.phone} /></Field>
        <Field label="Email (opsional)" htmlFor="email" error={e("email")}><Input id="email" type="email" {...register("email")} /></Field>
        <Field label="Produk yang dipilih" htmlFor="productId" error={e("productId")}>
          <NativeSelect id="productId" {...register("productId")} aria-invalid={!!errors.productId}><option value="">—</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</NativeSelect>
        </Field>
      </div>
      <Field label="Alamat usaha" htmlFor="addressLine" error={e("addressLine")}><Input id="addressLine" {...register("addressLine")} aria-invalid={!!errors.addressLine} /></Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Kota/Kabupaten" htmlFor="city" error={e("city")}><Input id="city" {...register("city")} aria-invalid={!!errors.city} /></Field>
        <Field label="Provinsi" htmlFor="province" error={e("province")}><NativeSelect id="province" {...register("province")}><option value="">—</option>{PROVINCES.map((p) => <option key={p}>{p}</option>)}</NativeSelect></Field>
        <Field label="Kode pos" htmlFor="postalCode" error={e("postalCode")}><Input id="postalCode" inputMode="numeric" maxLength={5} {...register("postalCode")} /></Field>
      </div>
      <div className="grid items-end gap-4 sm:grid-cols-[1fr_1fr_auto]">
        <Field label="Latitude" htmlFor="latitude"><Input id="latitude" inputMode="decimal" {...register("latitude")} /></Field>
        <Field label="Longitude" htmlFor="longitude"><Input id="longitude" inputMode="decimal" {...register("longitude")} /></Field>
        <Button type="button" variant="outline" onClick={locate}><MapPin />Gunakan lokasi saya</Button>
      </div>
      <Field label="Catatan" htmlFor="notes"><Textarea id="notes" {...register("notes")} /></Field>
      <div><Button type="submit" disabled={pending}>{pending && <Loader2 className="animate-spin" />}{leadId ? "Simpan perubahan" : "Buat lead merchant"}</Button></div>
    </form>
  );
}
