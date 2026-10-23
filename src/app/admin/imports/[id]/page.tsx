import Link from "next/link";
import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import { adminPage } from "@/server/page-auth";
import { prisma } from "@/server/db";
import { getDictionary } from "@/lib/i18n/server";
import { serialize } from "@/lib/money";
import { formatDateTime } from "@/lib/time";
import { Alert, Kpi, PageHeader } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { DataTable } from "@/components/shared/data-table";
import { ActionButton } from "@/components/shared/action-button";
import { cancelImportAction, commitImportAction } from "../../actions";

export const metadata = { title: "Pratinjau impor" };

export default async function ImportDetail({ params }: { params: Promise<{ id: string }> }) {
  await adminPage("import.manage");
  const { t, locale } = await getDictionary();
  const { id } = await params;
  const imp = await prisma.transactionImport.findUnique({ where: { id } });
  if (!imp) notFound();
  const rows = await prisma.importRow.findMany({ where: { importId: id }, orderBy: { rowNumber: "asc" }, take: 2000 });
  const L = t.status as unknown as Record<string, string>;
  return (
    <>
      <PageHeader
        eyebrow={<Link href="/admin/imports" className="hover:underline">← {t.nav.imports}</Link>}
        title={imp.fileName}
        description={<span className="flex flex-wrap items-center gap-2">{imp.type} · sumber {imp.source ?? "—"} · {formatDateTime(imp.createdAt, locale)} <StatusBadge status={imp.status} label={L[imp.status]} /></span>}
        actions={
          <>
            {(imp.status === "VALIDATED" || imp.status === "FAILED") && imp.validRows > 0 && <ActionButton action={commitImportAction} args={{ importId: imp.id }} label={imp.status === "FAILED" ? "Coba terapkan lagi" : `Terapkan ${imp.validRows} baris valid`} variant="success" size="default" confirmTitle="Terapkan impor?" confirmBody="Baris valid diproses melalui jalur idempoten yang sama dengan API. Baris yang sudah ada dilewati." />}
            {imp.status === "VALIDATED" && <ActionButton action={cancelImportAction} args={{ importId: imp.id }} label="Batalkan" variant="outline" size="default" />}
            {(imp.invalidRows > 0 || imp.duplicateRows > 0) && <Button asChild variant="outline"><a href={`/admin/imports/${imp.id}/errors`}><Download />Laporan error (CSV)</a></Button>}
          </>
        }
      />
      {imp.previousImportId && <div className="mb-4"><Alert variant="info" title="Berkas ini identik dengan impor sebelumnya">Impor ulang aman — baris yang sudah diterapkan akan ditandai sebagai duplikat, bukan dikreditkan dua kali. <Link className="underline" href={`/admin/imports/${imp.previousImportId}`}>Lihat impor sebelumnya</Link></Alert></div>}
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Kpi label="Total baris" value={imp.totalRows} /><Kpi label="Valid" value={imp.validRows} /><Kpi label="Tidak valid" value={imp.invalidRows} /><Kpi label="Duplikat" value={imp.duplicateRows} /><Kpi highlight label="Diimpor" value={imp.importedRows} />
      </div>
      <DataTable rows={serialize(rows.map((r) => ({ row: r.rowNumber, status: r.status, errors: (r.errors as string[]).join("; "), data: JSON.stringify(r.normalized ?? r.raw).slice(0, 160) })))} locale={locale} statusLabels={L} pageSize={50}
        columns={[{ key: "row", header: "Baris", type: "number" }, { key: "status", header: "Status", type: "status" }, { key: "errors", header: "Kesalahan" }, { key: "data", header: "Data", type: "mono" }]} />
    </>
  );
}
