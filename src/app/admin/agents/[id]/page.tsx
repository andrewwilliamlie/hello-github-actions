import Link from "next/link";
import { notFound } from "next/navigation";
import { FileText } from "lucide-react";
import { adminPage } from "@/server/page-auth";
import { prisma } from "@/server/db";
import { can } from "@/server/rbac";
import { getDictionary } from "@/lib/i18n/server";
import { formatRupiah, serialize } from "@/lib/money";
import { formatDateTime } from "@/lib/time";
import { maskPhone } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, DescriptionList, Kpi, PageHeader } from "@/components/ui/misc";
import { StatusBadge } from "@/components/ui/status-badge";
import { ActionButton } from "@/components/shared/action-button";
import { DataTable } from "@/components/shared/data-table";
import { NetworkTree } from "@/components/shared/network-tree";
import { referralNetwork } from "@/server/modules/referrals";
import { agentStatusAction, bankReviewAction, kycReviewAction, reassignReferrerAction } from "../../actions";

export const metadata = { title: "Detail agen" };

export default async function AdminAgentDetail({ params }: { params: Promise<{ id: string }> }) {
  const { actor } = await adminPage("agent.view");
  const { t, locale } = await getDictionary();
  const { id } = await params;
  const a = await prisma.agent.findUnique({
    where: { id },
    include: {
      user: true, kyc: true, wallet: true, agreements: true, bankAccounts: { orderBy: { createdAt: "desc" } },
      referralsReceived: { orderBy: { createdAt: "desc" }, include: { referrer: true } },
      attributions: { where: { effectiveTo: null }, include: { merchant: true } },
    },
  });
  if (!a) notFound();
  const [flags, events, tree] = await Promise.all([
    prisma.fraudFlag.findMany({ where: { agentId: id }, orderBy: { createdAt: "desc" } }),
    prisma.commissionEvent.findMany({ where: { agentId: id }, orderBy: { createdAt: "desc" }, take: 300 }),
    referralNetwork(actor, id, 2),
  ]);
  const L = t.status as unknown as Record<string, string>;
  const liveRef = a.referralsReceived.find((r) => !r.endedAt);
  const canApprove = can(actor, "agent.approve");
  return (
    <>
      <PageHeader
        eyebrow={<Link href="/admin/agents" className="hover:underline">← {t.nav.agents}</Link>}
        title={a.fullName}
        description={<span className="flex flex-wrap items-center gap-2"><span className="font-mono">{a.agentCode}</span>· ref <span className="font-mono">{a.referralCode}</span><StatusBadge status={a.status} label={L[a.status]} /></span>}
        actions={
          <>
            {a.status === "PENDING" && canApprove && <ActionButton action={agentStatusAction} args={{ agentId: a.id, status: "ACTIVE" }} label="Setujui agen" variant="success" confirmTitle="Setujui agen ini?" confirmBody="Agen dapat mulai mendaftarkan merchant dan komisinya dapat dirilis." />}
            {a.status === "PENDING" && canApprove && <ActionButton action={agentStatusAction} args={{ agentId: a.id, status: "REJECTED" }} label="Tolak" variant="destructive" reason={{ label: "Alasan penolakan", minLength: 5 }} />}
            {a.status === "ACTIVE" && can(actor, "agent.suspend") && <ActionButton action={agentStatusAction} args={{ agentId: a.id, status: "SUSPENDED" }} label="Tangguhkan" variant="destructive" reason={{ label: "Alasan penangguhan", minLength: 5 }} confirmBody="Komisi agen tertahan (tidak dirilis) dan penarikan diblokir selama ditangguhkan." />}
            {a.status === "SUSPENDED" && canApprove && <ActionButton action={agentStatusAction} args={{ agentId: a.id, status: "ACTIVE" }} label="Aktifkan kembali" variant="success" />}
          </>
        }
      />
      {flags.some((f) => f.status === "OPEN") && <div className="mb-4"><Alert variant="danger" title="Tanda risiko terbuka">{flags.filter((f) => f.status === "OPEN").map((f) => `${f.type} (${f.severity})`).join(", ")} — <Link className="underline" href="/admin/fraud">tinjau</Link></Alert></div>}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi label="Tertunda" value={formatRupiah(a.wallet?.pendingBalance)} />
        <Kpi label="Dapat ditarik" value={formatRupiah(a.wallet?.payableBalance)} />
        <Kpi label="Dalam penarikan" value={formatRupiah(a.wallet?.reservedBalance)} />
        <Kpi label="Dibayar" value={formatRupiah(a.wallet?.paidTotal)} />
        <Kpi label="Piutang clawback" value={formatRupiah(a.wallet?.receivableBalance)} />
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Profil</CardTitle></CardHeader>
          <CardContent>
            <DescriptionList items={[
              { label: "Email", value: a.email }, { label: "Ponsel", value: maskPhone(a.phone) }, { label: "Alamat", value: `${a.addressLine}, ${a.city}, ${a.province} ${a.postalCode ?? ""}` },
              { label: "Terdaftar", value: formatDateTime(a.createdAt, locale) }, { label: "Ponsel terverifikasi", value: formatDateTime(a.user.phoneVerifiedAt, locale) },
              { label: "Perjanjian", value: a.agreements.map((g) => `${g.agreementVersion} (${formatDateTime(g.acceptedAt, locale)})`).join(", ") || "—" },
              { label: "WhatsApp", value: a.whatsappOptIn ? "Diizinkan" : "Tidak" }, { label: "Catatan status", value: a.statusReason ?? "—" },
            ]} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2">KYC <StatusBadge status={a.kyc?.status ?? "NOT_SUBMITTED"} label={L[a.kyc?.status ?? "NOT_SUBMITTED"]} /></CardTitle><CardDescription>Dokumen berklasifikasi RESTRICTED; setiap pembukaan tercatat di log audit.</CardDescription></CardHeader>
          <CardContent className="grid gap-3 text-sm">
            <div>NIK: <span className="font-mono">****{a.kyc?.idNumberLast4 ?? "—"}</span> · diajukan {formatDateTime(a.kyc?.submittedAt, locale)}</div>
            {can(actor, "kyc.review") && a.kyc?.idCardFileId && (
              <div className="flex gap-3">
                <a className="flex items-center gap-1 font-semibold text-navy-700 hover:underline" href={`/api/files/${a.kyc.idCardFileId}`} target="_blank"><FileText className="size-4" />Foto KTP</a>
                {a.kyc.selfieFileId && <a className="flex items-center gap-1 font-semibold text-navy-700 hover:underline" href={`/api/files/${a.kyc.selfieFileId}`} target="_blank"><FileText className="size-4" />Selfie</a>}
              </div>
            )}
            {a.kyc?.rejectionReason && <Alert variant="danger">{a.kyc.rejectionReason}</Alert>}
            {a.kyc?.status === "SUBMITTED" && can(actor, "kyc.review") && (
              <div className="flex gap-2">
                <ActionButton action={kycReviewAction} args={{ agentId: a.id, decision: "VERIFIED" }} label="Verifikasi KTP" variant="success" confirmTitle="Konfirmasi: data KTP cocok dengan foto dan nama?" />
                <ActionButton action={kycReviewAction} args={{ agentId: a.id, decision: "REJECTED" }} label="Tolak KTP" variant="destructive" reason={{ label: "Alasan", minLength: 5 }} />
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Rekening bank</CardTitle></CardHeader>
          <CardContent>
            <ul className="divide-y text-sm">
              {a.bankAccounts.map((b) => (
                <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>{b.bankName} ****{b.accountNumberLast4} · {b.accountHolderName}</span>
                  <span className="flex items-center gap-2">
                    <StatusBadge status={b.status} label={L[b.status]} />
                    {b.status === "PENDING_VERIFICATION" && can(actor, "bank.verify") && (
                      <>
                        <ActionButton action={bankReviewAction} args={{ bankAccountId: b.id, decision: "VERIFIED" }} label="Verifikasi" variant="success" confirmTitle="Nama pemilik rekening sesuai dengan nama agen?" />
                        <ActionButton action={bankReviewAction} args={{ bankAccountId: b.id, decision: "REJECTED" }} label="Tolak" variant="outline" reason={{ label: "Alasan", minLength: 5 }} />
                      </>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Referral</CardTitle><CardDescription>Perubahan referrer bersifat tidak retroaktif dan diaudit.</CardDescription></CardHeader>
          <CardContent className="grid gap-3 text-sm">
            {a.referralsReceived.length === 0 ? <p className="text-muted-foreground">Mendaftar tanpa kode referral.</p> : (
              <ul className="space-y-1">
                {a.referralsReceived.map((r) => <li key={r.id}>Direkrut oleh <Link className="font-semibold underline" href={`/admin/agents/${r.referrerAgentId}`}>{r.referrer.fullName}</Link> ({r.referralCodeUsed}) · <StatusBadge status={r.status} label={L[r.status]} />{r.endedAt && ` · berakhir ${formatDateTime(r.endedAt, locale)}: ${r.endedReason}`}</li>)}
              </ul>
            )}
            {can(actor, "referral.reassign") && (
              <div><ActionButton action={reassignReferrerAction} args={{ recruitAgentId: a.id }} label={liveRef ? "Ubah referrer" : "Tetapkan referrer"} variant="outline" input={{ label: "Kode agen atau kode referral referrer baru", placeholder: "HJA-000001" }} reason={{ label: "Alasan & persetujuan (dicatat di audit)", minLength: 10 }} confirmBody="Pengecekan otomatis mencegah referral diri sendiri dan hubungan melingkar." /></div>
            )}
            <NetworkTree nodes={tree} labels={L} rootLabel="Rekrutan" />
          </CardContent>
        </Card>
      </div>
      <h2 className="mb-3 mt-8 text-lg font-bold">Merchant teratribusi</h2>
      <DataTable rows={serialize(a.attributions.map((m) => ({ id: m.merchant.id, name: m.merchant.businessName, code: m.merchant.merchantCode, status: m.merchant.status, since: m.effectiveFrom })))} locale={locale} statusLabels={L} searchable={false}
        columns={[{ key: "name", header: "Merchant", type: "link", href: "/admin/merchants/{id}", sub: "code" }, { key: "status", header: "Status", type: "status" }, { key: "since", header: "Sejak", type: "date" }]} />
      <h2 className="mb-3 mt-8 text-lg font-bold">Komisi (300 terbaru)</h2>
      <DataTable rows={serialize(events.map((e) => ({ id: e.id, type: t.commissionType[e.type], ref: e.eventRef, status: e.status, amount: e.amount - e.deductedAmount, date: e.businessDate })))} locale={locale} statusLabels={L}
        columns={[{ key: "type", header: "Jenis", type: "link", href: "/admin/commissions/{id}", sub: "ref" }, { key: "status", header: "Status", type: "status" }, { key: "date", header: "Tanggal", type: "bizdate" }, { key: "amount", header: "Jumlah", type: "money", align: "right" }]} />
    </>
  );
}
