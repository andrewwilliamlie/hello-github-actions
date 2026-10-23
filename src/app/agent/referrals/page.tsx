import QRCode from "qrcode";
import { pageContext } from "@/server/page-auth";
import { prisma } from "@/server/db";
import { env } from "@/server/env";
import { referralNetwork } from "@/server/modules/referrals";
import { getDictionary } from "@/lib/i18n/server";
import { formatBps, formatRupiah, serialize } from "@/lib/money";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, Kpi, PageHeader } from "@/components/ui/misc";
import { ReferralShare } from "@/components/shared/referral-share";
import { DataTable } from "@/components/shared/data-table";
import { NetworkTree } from "@/components/shared/network-tree";

export const metadata = { title: "Referral" };

export default async function ReferralsPage() {
  const { actor } = await pageContext("agent");
  const { t, locale } = await getDictionary();
  const agent = await prisma.agent.findUniqueOrThrow({ where: { id: actor.agentId! } });
  const link = `${env().APP_URL}/r/${agent.referralCode}`;
  const now = new Date();
  const live = { status: "ACTIVE" as const, effectiveFrom: { lte: now }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }] };
  const [tree, qr, refSales, refTxn, totals] = await Promise.all([
    referralNetwork(actor, agent.id, 3),
    QRCode.toDataURL(link, { margin: 1, width: 180, color: { dark: "#0b1b42" } }),
    prisma.commissionRule.findFirst({ where: { ...live, type: "REFERRAL_SALES" }, orderBy: [{ priority: "desc" }, { effectiveFrom: "desc" }] }),
    prisma.commissionRule.findFirst({ where: { ...live, type: "REFERRAL_TRANSACTION" }, orderBy: [{ priority: "desc" }, { effectiveFrom: "desc" }] }),
    prisma.commissionEvent.aggregate({ where: { agentId: agent.id, type: { in: ["REFERRAL_SALES", "REFERRAL_TRANSACTION"] }, status: { not: "REVERSED" } }, _sum: { amount: true } }),
  ]);
  const pending = tree.filter((n) => n.referralStatus === "PENDING").length;
  const approved = tree.filter((n) => n.referralStatus === "APPROVED").length;
  const rows = tree.map((n) => ({ id: n.agentId, name: n.name, code: n.agentCode, status: n.status, referral: n.referralStatus, merchants: n.merchants, txns: n.txns30d, earnings: n.earningsForReferrer, joinedAt: n.joinedAt }));
  return (
    <>
      <PageHeader title={t.nav.referrals} description="Ajak agen baru. Anda memperoleh bagi hasil hanya dari komisi bersih yang memenuhi syarat milik rekrutan langsung — bukan dari pendaftaran." />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label={t.agent.directRecruits} value={tree.length} />
        <Kpi label="Disetujui" value={approved} />
        <Kpi label="Menunggu persetujuan" value={pending} />
        <Kpi highlight label={t.agent.referralRewards} value={formatRupiah(totals._sum.amount ?? 0n)} />
      </div>
      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <Card>
          <CardHeader><CardTitle>{t.agent.referralBox}</CardTitle><CardDescription>Kode referral Anda permanen.</CardDescription></CardHeader>
          <CardContent>{agent.status === "ACTIVE" ? <ReferralShare code={agent.referralCode} link={link} /> : <Alert variant="warning">Tautan rekrutmen aktif setelah akun Anda disetujui.</Alert>}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Kode QR & ketentuan</CardTitle></CardHeader>
          <CardContent className="grid gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {agent.status === "ACTIVE" && <img src={qr} alt={`QR tautan rekrutmen ${agent.referralCode}`} width={180} height={180} className="mx-auto rounded-lg border" />}
            <ul className="space-y-1 text-sm">
              <li>Bagi hasil komisi penjualan rekrutan: <b>{refSales?.rateBps != null ? formatBps(refSales.rateBps) : "belum dikonfigurasi"}</b></li>
              <li>Bagi hasil imbalan transaksi rekrutan: <b>{refTxn?.rateBps != null ? formatBps(refTxn.rateBps) : "belum dikonfigurasi"}</b></li>
            </ul>
            <p className="text-xs text-muted-foreground">{t.agent.multiLevelNote}</p>
          </CardContent>
        </Card>
      </div>
      <h2 className="mb-3 mt-8 text-lg font-bold">{t.agent.directRecruits}</h2>
      <DataTable rows={serialize(rows)} locale={locale} statusLabels={t.status as unknown as Record<string, string>} emptyTitle="Belum ada rekrutan" emptyBody="Bagikan tautan rekrutmen Anda."
        columns={[
          { key: "name", header: "Agen", sub: "code" }, { key: "status", header: "Status agen", type: "status" }, { key: "referral", header: "Status referral", type: "status" },
          { key: "merchants", header: "Merchant", type: "number", align: "right" }, { key: "txns", header: "Transaksi 30 hari", type: "number", align: "right" },
          { key: "earnings", header: "Bagi hasil Anda", type: "money", align: "right" }, { key: "joinedAt", header: "Bergabung", type: "date" },
        ]} />
      <Card className="mt-8">
        <CardHeader><CardTitle>{t.agent.networkTree}</CardTitle><CardDescription>{t.agent.multiLevelNote}</CardDescription></CardHeader>
        <CardContent><NetworkTree nodes={tree} labels={t.status as unknown as Record<string, string>} rootLabel={`${agent.fullName} (${agent.agentCode})`} /></CardContent>
      </Card>
    </>
  );
}
