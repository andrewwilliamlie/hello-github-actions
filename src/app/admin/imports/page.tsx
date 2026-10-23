import { adminPage } from "@/server/page-auth";
import { prisma } from "@/server/db";
import { getDictionary } from "@/lib/i18n/server";
import { serialize } from "@/lib/money";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/shared/data-table";
import { UploadForm } from "./upload-form";

export const metadata = { title: "Impor data" };

export default async function Imports() {
  await adminPage("import.manage");
  const { t, locale } = await getDictionary();
  const imports = await prisma.transactionImport.findMany({ orderBy: { createdAt: "desc" }, take: 500 });
  const rows = imports.map((i) => ({ id: i.id, file: i.fileName, type: i.type, source: i.source ?? "—", status: i.status, total: i.totalRows, valid: i.validRows, invalid: i.invalidRows, dup: i.duplicateRows, imported: i.importedRows, reimport: i.previousImportId ? "Ya" : "", createdAt: i.createdAt }));
  return (
    <>
      <PageHeader title={t.nav.imports} description="Unggah → validasi & deduplikasi → pratinjau → terapkan. Mengimpor ulang berkas yang sama aman: baris yang sudah ada dilewati." />
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Unggah berkas</CardTitle>
          <CardDescription className="flex flex-wrap gap-2">Templat:
            {(["TRANSACTIONS", "SETTLEMENTS", "MERCHANT_LEADS", "DEVICES"] as const).map((k) => <Button key={k} asChild size="sm" variant="link" className="h-auto p-0"><a href={`/admin/imports/template?type=${k}`}>{k.toLowerCase()}.csv</a></Button>)}
          </CardDescription>
        </CardHeader>
        <CardContent><UploadForm /></CardContent>
      </Card>
      <DataTable rows={serialize(rows)} locale={locale} statusLabels={t.status as unknown as Record<string, string>} emptyTitle="Belum ada impor"
        columns={[
          { key: "file", header: "Berkas", type: "link", href: "/admin/imports/{id}", sub: "type" }, { key: "source", header: "Sumber", type: "mono" }, { key: "status", header: "Status", type: "status" },
          { key: "total", header: "Baris", type: "number", align: "right" }, { key: "valid", header: "Valid", type: "number", align: "right" }, { key: "invalid", header: "Tidak valid", type: "number", align: "right" },
          { key: "dup", header: "Duplikat", type: "number", align: "right" }, { key: "imported", header: "Diimpor", type: "number", align: "right" }, { key: "reimport", header: "Impor ulang" }, { key: "createdAt", header: "Diunggah", type: "datetime" },
        ]} />
    </>
  );
}
