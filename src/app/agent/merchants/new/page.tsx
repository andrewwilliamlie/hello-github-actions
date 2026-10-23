import { redirect } from "next/navigation";
import { pageContext } from "@/server/page-auth";
import { prisma } from "@/server/db";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { LeadForm } from "../lead-form";

export const metadata = { title: "Merchant baru" };

export default async function NewLeadPage() {
  const { actor } = await pageContext("agent");
  const agent = await prisma.agent.findUniqueOrThrow({ where: { id: actor.agentId! } });
  if (agent.status !== "ACTIVE") redirect("/agent/onboarding");
  const products = await prisma.product.findMany({ where: { isActive: true, deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } });
  return (
    <>
      <PageHeader title="Daftarkan merchant" description="Lead yang sama tidak dapat didaftarkan oleh dua agen. Setelah lead dibuat, unggah dokumen lalu ajukan aplikasi." />
      <Card><CardContent className="pt-5"><LeadForm products={products} /></CardContent></Card>
    </>
  );
}
