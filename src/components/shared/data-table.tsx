"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { flexRender, getCoreRowModel, getFilteredRowModel, getPaginationRowModel, getSortedRowModel, useReactTable, type ColumnDef, type SortingState } from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/misc";
import { formatRupiah } from "@/lib/money";
import { formatBusinessDate, formatDate, formatDateTime } from "@/lib/time";

export type ColumnSpec = {
  key: string;
  header: string;
  type?: "text" | "mono" | "money" | "number" | "date" | "datetime" | "bizdate" | "status" | "link" | "demo" | "boolean";
  /** For type=link: href with {field} placeholders, e.g. "/admin/agents/{id}". */
  href?: string;
  /** For type=link: field shown as link text (defaults to key). */
  sub?: string; // optional secondary line field
  align?: "right";
  sortable?: boolean;
};

type Row = Record<string, unknown>;

function interpolate(tpl: string, row: Row) {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => encodeURIComponent(String(row[k] ?? "")));
}

export function DataTable({ rows, columns, statusLabels = {}, searchable = true, pageSize = 20, emptyTitle = "Belum ada data", emptyBody, searchPlaceholder = "Cari…", locale = "id" }: {
  rows: Row[]; columns: ColumnSpec[]; statusLabels?: Record<string, string>; searchable?: boolean; pageSize?: number; emptyTitle?: string; emptyBody?: string; searchPlaceholder?: string; locale?: string;
}) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [filter, setFilter] = useState("");
  const defs = useMemo<ColumnDef<Row>[]>(
    () =>
      columns.map((c) => ({
        id: c.key,
        accessorFn: (r) => r[c.key],
        header: c.header,
        enableSorting: c.sortable !== false,
        sortingFn: c.type === "money" || c.type === "number" ? (a, b, id) => Number(a.getValue(id) ?? 0) - Number(b.getValue(id) ?? 0) : "alphanumeric",
        cell: ({ row }) => {
          const v = row.original[c.key];
          const sub = c.sub ? row.original[c.sub] : null;
          let node: React.ReactNode;
          switch (c.type) {
            case "money": node = <span className="tabular font-semibold">{formatRupiah(v as string)}</span>; break;
            case "number": node = <span className="tabular">{Number(v ?? 0).toLocaleString("id-ID")}</span>; break;
            case "date": node = formatDate(v as string, locale); break;
            case "datetime": node = <span className="whitespace-nowrap">{formatDateTime(v as string, locale)}</span>; break;
            case "bizdate": node = formatBusinessDate(v as string, locale); break;
            case "status": node = v ? <StatusBadge status={String(v)} label={statusLabels[String(v)]} /> : "—"; break;
            case "mono": node = <span className="font-mono text-xs">{String(v ?? "—")}</span>; break;
            case "demo": node = v ? <Badge variant="demo">Demo</Badge> : null; break;
            case "boolean": node = v ? "Ya" : "Tidak"; break;
            case "link": node = c.href ? <Link className="font-semibold text-navy-700 hover:underline" href={interpolate(c.href, row.original)}>{String(v ?? "—")}</Link> : String(v ?? "—"); break;
            default: node = v === null || v === undefined || v === "" ? "—" : String(v);
          }
          return (
            <div className={c.align === "right" ? "text-right" : ""}>
              {node}
              {sub ? <div className="text-xs text-muted-foreground">{String(sub)}</div> : null}
            </div>
          );
        },
      })),
    [columns, statusLabels, locale],
  );
  const table = useReactTable({
    data: rows, columns: defs, state: { sorting, globalFilter: filter }, onSortingChange: setSorting, onGlobalFilterChange: setFilter,
    getCoreRowModel: getCoreRowModel(), getSortedRowModel: getSortedRowModel(), getFilteredRowModel: getFilteredRowModel(), getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize } }, globalFilterFn: "includesString",
  });
  const filtered = table.getFilteredRowModel().rows.length;
  return (
    <div className="grid gap-3">
      {searchable && rows.length > 0 && (
        <div className="relative max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input aria-label={searchPlaceholder} placeholder={searchPlaceholder} value={filter} onChange={(e) => setFilter(e.target.value)} className="pl-9" />
        </div>
      )}
      {rows.length === 0 ? (
        <EmptyState title={emptyTitle} body={emptyBody} />
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full text-sm tabular">
            <thead className="border-b bg-muted/50">
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id}>
                  {hg.headers.map((h) => {
                    const spec = columns.find((c) => c.key === h.id);
                    const sorted = h.column.getIsSorted();
                    return (
                      <th key={h.id} className={`h-10 whitespace-nowrap px-3 text-[11px] font-bold uppercase tracking-wider text-muted-foreground ${spec?.align === "right" ? "text-right" : "text-left"}`} aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : "none"}>
                        {h.column.getCanSort() ? (
                          <button type="button" className="inline-flex items-center gap-1 uppercase" onClick={h.column.getToggleSortingHandler()}>
                            {flexRender(h.column.columnDef.header, h.getContext())}
                            {sorted === "asc" ? <ArrowUp className="size-3" /> : sorted === "desc" ? <ArrowDown className="size-3" /> : <ArrowUpDown className="size-3 opacity-40" />}
                          </button>
                        ) : (
                          flexRender(h.column.columnDef.header, h.getContext())
                        )}
                      </th>
                    );
                  })}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map((r) => (
                <tr key={r.id} className="border-b last:border-0 hover:bg-muted/40">
                  {r.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-3 py-2.5 align-middle">{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
                  ))}
                </tr>
              ))}
              {filtered === 0 && (
                <tr><td colSpan={columns.length} className="px-3 py-8 text-center text-muted-foreground">Tidak ada hasil yang cocok</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      {filtered > pageSize && (
        <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
          <span>
            {filtered.toLocaleString("id-ID")} baris · halaman {table.getState().pagination.pageIndex + 1} / {table.getPageCount()}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>Sebelumnya</Button>
            <Button variant="outline" size="sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>Berikutnya</Button>
          </div>
        </div>
      )}
    </div>
  );
}
