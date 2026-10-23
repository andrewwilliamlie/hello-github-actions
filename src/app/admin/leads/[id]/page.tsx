import Link from "next/link";
import { notFound } from "next/navigation";
import { FileText } from "lucide-react";
import { adminPage } from "@/server/page-auth";
import { getLeadDetail } from "@/server/modules/merchants";
import { prisma } from "@/server/db";
import { can } from "@/server/rbac";
import { AppError } from "@/server/errors";
import { getDictionary } from "@/lib/i18n/server";
import { formatDateTime } from "@/lib/time";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, DescriptionList, PageHeader } from "@/components/ui/misc";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { ActionButton } from "@/components/shared/action-button";
import { StageTimeline, effectiveStage } from "@/components/shared/stage-timeline";
import { leadReviewAction } from "../../actions";

export const metadata = { title: "Tinjau aplikasi" };

export default async function AdminLead({ params }: { params: Promise<{ id: string }> }) {
  const { actor } = await adminPage("merchant.view");
  const { t, locale } = await getDictionary();
  const { id } = await params;
  let lead;
  try {
    lead = await getLeadDetail(actor, id);
  } catch (e) {
    if (e instanceof AppError) notFound();
    throw e;
  }
  const dupes = await prisma.merchantLead.findMany({ where: { id: { not: lead.id }, OR: [{ phone: lead.phone }, { dedupeKey: lead.dedupeKey }] }, select: { id: true, businessName: true, status: true, agentId: true } });
  const L = t.status as unknown as Record<string, string>;
  const reviewing = ["APPLICATION_SUBMITTED", "UNDER_REVIEW"].includes(lead.status) && can(actor, "merchant.review");
  return (
    <>
      <PageHeader
        eyebrow={<Link href="/admin/leads" className="hover:underline">← {t.nav.leads}</Link>}
        title={lead.businessName}
        description={<>Lead #{lead.leadNumber} · agen <Link className="underline" href={`/admin/agents/${lead.agent.id}`}>{lead.agent.fullName} ({lead.agent.agentCode})</Link></>}
        actions={reviewing ? (
          <>
            {lead.status === "APPLICATION_SUBMITTED" && <ActionButton action={leadReviewAction} args={{ leadId: lead.id, decision: "start_review" }} label="Mulai tinjau" variant="outline" />}
            <ActionButton action={leadReviewAction} args={{ leadId: lead.id, decision: "request_revision" }} label="Minta revisi" variant="outline" reason={{ label: "Apa yang perlu diperbaiki?", minLength: 5 }} />
            <ActionButton action={leadReviewAction} args={{ leadId: lead.id, decision: "reject" }} label="Tolak" variant="destructive" reason={{ label: "Alasan penolakan", minLength: 5 }} />
            <ActionButton action={leadReviewAction} args={{ leadId: lead.id, decision: "approve" }} label="Setujui merchant" variant="success" confirmTitle="Setujui merchant?" confirmBody="Membuat ID merchant permanen, mengatribusikan ke agen, dan membuat pesanan dengan harga saat ini." />
          </>
        ) : lead.merchant ? <Button asChild><Link href={`/admin/merchants/${lead.merchant.id}`}>Buka merchant {lead.merchant.merchantCode}</Link></Button> : undefined}
      />
      <Card className="mb-6"><CardContent className="pt-5"><StageTimeline stage={effectiveStage(lead.status, lead.merchant?.status)} labels={L} /></CardContent></Card>
      {dupes.length > 0 && <div className="mb-6"><Alert variant="warning" title="Kemungkinan duplikat">{dupes.map((d) => `${d.businessName} (${L[d.status]})`).join(", ")}</Alert></div>}
      {lead.revisionNote && <div className="mb-6"><Alert variant="info" title="Catatan revisi terakhir">{lead.revisionNote}</Alert></div>}
      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Data aplikasi</CardTitle></CardHeader>
          <CardContent>
            <DescriptionList items={[
              { label: "Pemilik", value: lead.ownerName }, { label: "Ponsel", value: lead.phone }, { label: "Email", value: lead.email ?? "—" }, { label: "Jenis usaha", value: lead.businessType },
              { label: "Alamat", value: `${lead.addressLine}, ${lead.city}, ${lead.province} ${lead.postalCode ?? ""}` },
              { label: "Lokasi", value: lead.latitude ? <a className="underline" target="_blank" rel="noreferrer" href={`https://www.openstreetmap.org/?mlat=${lead.latitude}&mlon=${lead.longitude}#map=17/${lead.latitude}/${lead.longitude}`}>{`${lead.latitude}, ${lead.longitude}`}</a> : "—" },
              { label: "Produk", value: lead.product.name }, { label: "Diajukan", value: formatDateTime(lead.submittedAt, locale) }, { label: "Catatan agen", value: lead.notes ?? "—" },
            ]} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Dokumen</CardTitle><CardDescription>Dibuka melalui rute terotorisasi; akses tercatat.</CardDescription></CardHeader>
          <CardContent>
            {lead.documents.length === 0 ? <p className="text-sm text-muted-foreground">Tidak ada dokumen.</p> : (
              <ul className="divide-y text-sm">
                {lead.documents.map((d) => (
                  <li key={d.id} className="flex items-center justify-between py-2">
                    <a href={`/api/files/${d.fileId}`} target="_blank" className="flex items-center gap-2 font-medium text-navy-700 hover:underline"><FileText className="size-4" />{d.type}</a>
                    <span className="text-xs text-muted-foreground">{formatDateTime(d.createdAt, locale)} <StatusBadge status={d.status} label={L[d.status] ?? d.status} /></span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
