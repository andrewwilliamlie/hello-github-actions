import Link from "next/link";
import { notFound } from "next/navigation";
import { adminPage } from "@/server/page-auth";
import { explainCommission } from "@/server/modules/commissions";
import { can } from "@/server/rbac";
import { AppError } from "@/server/errors";
import { getDictionary } from "@/lib/i18n/server";
import { PageHeader } from "@/components/ui/misc";
import { CommissionExplain } from "@/components/shared/commission-explain";
import { ActionButton } from "@/components/shared/action-button";
import { approveCommissionAction, reverseCommissionAction } from "../../actions";

export const metadata = { title: "Rincian komisi" };

export default async function AdminCommission({ params }: { params: Promise<{ id: string }> }) {
  const { actor } = await adminPage("commission.view");
  const { t, locale } = await getDictionary();
  const { id } = await params;
  let data;
  try {
    data = await explainCommission(actor, id);
  } catch (e) {
    if (e instanceof AppError) notFound();
    throw e;
  }
  const e = data.event;
  return (
    <>
      <PageHeader
        eyebrow={<Link href="/admin/commissions" className="hover:underline">← {t.nav.commissions}</Link>}
        title={t.agent.explain}
        actions={
          <>
            {e.status === "ELIGIBLE" && can(actor, "commission.approve") && <ActionButton action={approveCommissionAction} args={{ ids: e.id }} label="Setujui" variant="success" />}
            {e.status !== "REVERSED" && can(actor, "commission.reverse") && <ActionButton action={reverseCommissionAction} args={{ eventId: e.id }} label="Batalkan / clawback" variant="destructive" reason={{ label: "Alasan (mis. fraud, refund manual)", minLength: 5 }} confirmBody="Jika sudah dapat ditarik/dibayar, saldo agen dipotong lalu sisanya menjadi piutang clawback. Komisi referral turunan ikut dibatalkan." />}
          </>
        }
      />
      <CommissionExplain data={data} t={t} locale={locale} admin />
    </>
  );
}
