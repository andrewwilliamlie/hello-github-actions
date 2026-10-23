import Link from "next/link";
import { notFound } from "next/navigation";
import { FileText } from "lucide-react";
import { pageContext } from "@/server/page-auth";
import { getLeadDetail } from "@/server/modules/merchants";
import { prisma } from "@/server/db";
import { getDictionary } from "@/lib/i18n/server";
import { formatRupiah } from "@/lib/money";
import { formatDate, formatDateTime } from "@/lib/time";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, DescriptionList, PageHeader } from "@/components/ui/misc";
import { Field } from "@/components/ui/label";
import { Input, NativeSelect } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { ActionButton } from "@/components/shared/action-button";
import { ActionForm } from "@/components/shared/action-form";
import { StageTimeline, effectiveStage } from "@/components/shared/stage-timeline";
import { LeadForm } from "../lead-form";
import { leadTransitionAction, submitPaymentAction, uploadLeadDocAction } from "../../actions";
import { AppError } from "@/server/errors";

export const metadata = { title: "Detail merchant" };

const DOC_LABELS: Record<string, string> = { OWNER_ID_CARD: "KTP pemilik", NPWP: "NPWP", NIB: "NIB / izin usaha", STORE_PHOTO: "Foto tempat usaha", BANK_BOOK: "Buku tabungan", OTHER: "Lainnya" };

export default async function AgentLeadDetail({ params }: { params: Promise<{ id: string }> }) {
  const { actor } = await pageContext("agent");
  const { t, locale } = await getDictionary();
  const { id } = await params;
  let lead;
  try {
    lead = await getLeadDetail(actor, id);
  } catch (e) {
    if (e instanceof AppError) notFound();
    throw e;
  }
  if (lead.agentId !== actor.agentId) notFound();
  const stage = effectiveStage(lead.status, lead.merchant?.status);
  const editable = ["LEAD", "CONTACTED", "REVISION_REQUESTED"].includes(lead.status);
  const products = editable ? await prisma.product.findMany({ where: { isActive: true, deletedAt: null }, select: { id: true, name: true } }) : [];
  const orders = lead.merchant?.orders ?? [];
  const txStats = lead.merchant
    ? await prisma.transaction.groupBy({ by: ["rewardStatus"], where: { merchantId: lead.merchant.id, status: "SUCCESS" }, _count: true })
    : [];
  const labels = t.status as unknown as Record<string, string>;

  return (
    <>
      <PageHeader
        eyebrow={<Link href="/agent/merchants" className="hover:underline">← {t.nav.merchants}</Link>}
        title={lead.businessName}
        description={lead.merchant ? <>ID merchant <span className="font-mono font-semibold">{lead.merchant.merchantCode}</span></> : `Lead #${lead.leadNumber}`}
        actions={
          <>
            {lead.status === "LEAD" && <ActionButton action={leadTransitionAction} args={{ leadId: lead.id, action: "contacted" }} label="Tandai sudah dihubungi" variant="outline" />}
            {editable && <ActionButton action={leadTransitionAction} args={{ leadId: lead.id, action: "submit" }} label="Ajukan aplikasi" variant="default" confirmTitle="Ajukan aplikasi?" confirmBody="Pastikan data dan dokumen sudah benar. Tim Operasional akan meninjau aplikasi ini." />}
            {["LEAD", "CONTACTED", "APPLICATION_SUBMITTED", "REVISION_REQUESTED"].includes(lead.status) && <ActionButton action={leadTransitionAction} args={{ leadId: lead.id, action: "cancel" }} label="Batalkan lead" variant="outline" confirmTitle="Batalkan lead ini?" />}
          </>
        }
      />
      <Card className="mb-6"><CardContent className="pt-5"><StageTimeline stage={stage} labels={labels} /></CardContent></Card>
      {lead.status === "REVISION_REQUESTED" && <div className="mb-6"><Alert variant="warning" title="Revisi diminta oleh tim Operasional">{lead.revisionNote}</Alert></div>}
      {lead.status === "REJECTED" && <div className="mb-6"><Alert variant="danger" title="Aplikasi ditolak">{lead.rejectionReason}</Alert></div>}

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <div className="grid gap-6">
          <Card>
            <CardHeader><CardTitle>Data merchant</CardTitle></CardHeader>
            <CardContent>
              {editable ? (
                <LeadForm products={products} leadId={lead.id} defaults={{
                  businessName: lead.businessName, ownerName: lead.ownerName, phone: lead.phone, email: lead.email ?? "", businessType: lead.businessType, addressLine: lead.addressLine,
                  city: lead.city, province: lead.province, postalCode: lead.postalCode ?? "", productId: lead.productId, notes: lead.notes ?? "",
                  latitude: lead.latitude?.toString() ?? "", longitude: lead.longitude?.toString() ?? "",
                }} />
              ) : (
                <DescriptionList items={[
                  { label: "Pemilik", value: lead.ownerName }, { label: "Ponsel", value: lead.phone }, { label: "Jenis usaha", value: lead.businessType },
                  { label: "Produk", value: lead.product.name }, { label: "Alamat", value: `${lead.addressLine}, ${lead.city}, ${lead.province}` },
                  { label: "Koordinat", value: lead.latitude ? `${lead.latitude}, ${lead.longitude}` : "—" }, { label: "Diajukan", value: formatDateTime(lead.submittedAt, locale) },
                ]} />
              )}
            </CardContent>
          </Card>

          {orders.map((o) => (
            <Card key={o.id}>
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2">Pesanan ORD-{o.orderNumber} <StatusBadge status={o.status} label={labels[o.status]} /></CardTitle>
                <CardDescription>{o.product.name} · {formatRupiah(o.totalAmount)}</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4">
                {o.payments.length > 0 && (
                  <ul className="divide-y rounded-lg border text-sm">
                    {o.payments.map((p) => (
                      <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                        <span>{p.method} · <span className="font-mono">{p.reference}</span> · {formatRupiah(p.amount)}</span>
                        <StatusBadge status={p.status} label={labels[p.status]} />
                      </li>
                    ))}
                  </ul>
                )}
                {o.status === "AWAITING_PAYMENT" && (
                  <ActionForm action={submitPaymentAction} hidden={{ orderId: o.id }} submitLabel="Kirim bukti pembayaran">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label="Jumlah (Rp)" htmlFor={`amount-${o.id}`}><Input id={`amount-${o.id}`} name="amount" inputMode="numeric" defaultValue={o.totalAmount.toString()} required /></Field>
                      <Field label="Metode" htmlFor={`method-${o.id}`}><NativeSelect id={`method-${o.id}`} name="method"><option value="BANK_TRANSFER">Transfer bank</option><option value="VIRTUAL_ACCOUNT">Virtual account</option><option value="QRIS">QRIS</option><option value="CASH">Tunai</option></NativeSelect></Field>
                      <Field label="No. referensi" htmlFor={`ref-${o.id}`}><Input id={`ref-${o.id}`} name="reference" required /></Field>
                      <Field label="Nama pembayar" htmlFor={`payer-${o.id}`}><Input id={`payer-${o.id}`} name="payerName" /></Field>
                    </div>
                    <Field label="Bukti pembayaran" htmlFor={`proof-${o.id}`} hint="JPG/PNG/PDF"><Input id={`proof-${o.id}`} name="proof" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" /></Field>
                  </ActionForm>
                )}
                {o.device && <p className="text-sm">Perangkat: <span className="font-mono">{o.device.serialNumber}</span>{o.activation && <> · TID <span className="font-mono">{o.activation.terminalId}</span> · aktif {formatDate(o.activation.activatedAt, locale)}</>}</p>}
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid h-fit gap-6">
          <Card>
            <CardHeader><CardTitle>Dokumen</CardTitle><CardDescription>Wajib: KTP pemilik dan foto tempat usaha.</CardDescription></CardHeader>
            <CardContent className="grid gap-4">
              {lead.documents.length ? (
                <ul className="divide-y rounded-lg border text-sm">
                  {lead.documents.map((d) => (
                    <li key={d.id} className="flex items-center justify-between gap-2 p-3">
                      <a href={`/api/files/${d.fileId}`} className="flex items-center gap-2 font-medium hover:underline" target="_blank"><FileText className="size-4" />{DOC_LABELS[d.type]}</a>
                      <StatusBadge status={d.status} label={labels[d.status] ?? d.status} />
                    </li>
                  ))}
                </ul>
              ) : <p className="text-sm text-muted-foreground">Belum ada dokumen.</p>}
              {(editable || lead.status === "APPROVED") && (
                <ActionForm action={uploadLeadDocAction} hidden={{ leadId: lead.id }} submitLabel="Unggah" variant="secondary">
                  <Field label="Jenis dokumen" htmlFor="type"><NativeSelect id="type" name="type">{Object.entries(DOC_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</NativeSelect></Field>
                  <Field label="Berkas" htmlFor="file" hint="JPG/PNG/WEBP/PDF, maks. 8 MB"><Input id="file" name="file" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" required /></Field>
                </ActionForm>
              )}
            </CardContent>
          </Card>
          {lead.merchant && (
            <Card>
              <CardHeader><CardTitle>Transaksi merchant</CardTitle></CardHeader>
              <CardContent className="grid gap-2 text-sm">
                <div className="flex justify-between"><span>Transaksi berhasil</span><b className="tabular">{txStats.reduce((s, x) => s + x._count, 0).toLocaleString("id-ID")}</b></div>
                <div className="flex justify-between"><span>Memenuhi syarat imbalan</span><b className="tabular">{(txStats.find((x) => x.rewardStatus === "REWARDED")?._count ?? 0).toLocaleString("id-ID")}</b></div>
                <div className="flex justify-between"><span>Menunggu settlement</span><b className="tabular">{(txStats.find((x) => x.rewardStatus === "AWAITING_SETTLEMENT")?._count ?? 0).toLocaleString("id-ID")}</b></div>
                <Button asChild variant="outline" size="sm" className="mt-2"><Link href={`/agent/earnings?merchantId=${lead.merchant.id}`}>Lihat pendapatan dari merchant ini</Link></Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
