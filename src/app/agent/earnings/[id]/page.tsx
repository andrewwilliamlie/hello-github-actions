import Link from "next/link";
import { notFound } from "next/navigation";
import { pageContext } from "@/server/page-auth";
import { explainCommission } from "@/server/modules/commissions";
import { AppError } from "@/server/errors";
import { getDictionary } from "@/lib/i18n/server";
import { PageHeader } from "@/components/ui/misc";
import { CommissionExplain } from "@/components/shared/commission-explain";
import { ActionButton } from "@/components/shared/action-button";
import { disputeAction } from "../../actions";

export const metadata = { title: "Rincian komisi" };

export default async function EarningDetail({ params }: { params: Promise<{ id: string }> }) {
  const { actor } = await pageContext("agent");
  const { t, locale } = await getDictionary();
  const { id } = await params;
  let data;
  try {
    data = await explainCommission(actor, id);
  } catch (e) {
    if (e instanceof AppError) notFound();
    throw e;
  }
  return (
    <>
      <PageHeader
        eyebrow={<Link href="/agent/earnings" className="hover:underline">← {t.nav.earnings}</Link>}
        title={t.agent.explain}
        actions={data.event.status !== "REVERSED" ? <ActionButton action={disputeAction} args={{ eventId: id }} label="Ajukan sengketa" variant="outline" reason={{ label: "Jelaskan masalahnya", minLength: 10 }} confirmBody="Komisi yang masih tertunda akan dibekukan selama ditinjau." /> : undefined}
      />
      <CommissionExplain data={data} t={t} locale={locale} />
    </>
  );
}
