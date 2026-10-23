"use client";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { formatRupiah, formatRupiahCompact } from "@/lib/money";
import { BarChart3, Table2 } from "lucide-react";

// Validated categorical slots (fixed order; colour follows the entity, never its rank).
export const SERIES = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100"];
// Ordinal blue ramp for ordered stages (steps 250 → 600, nearest-surface step ≥ 2:1).
const ORDINAL = ["#86b6ef", "#5598e7", "#3987e5", "#2a78d6", "#1c5cab", "#184f95"];
const AXIS = { fontSize: 11, fill: "#5b6478" };
const GRID = "#e3e8f0";

type Fmt = "money" | "number";
const fmt = (v: number, f: Fmt) => (f === "money" ? formatRupiah(Math.round(v)) : v.toLocaleString("id-ID"));
const fmtAxis = (v: number, f: Fmt) => (f === "money" ? formatRupiahCompact(v) : v.toLocaleString("id-ID"));
const shortDay = (d: string) => {
  const [, m, day] = d.split("-");
  return `${Number(day)}/${Number(m)}`;
};

function ChartFrame({ title, description, table, children, empty }: { title: string; description?: string; table: React.ReactNode; children: React.ReactNode; empty?: boolean }) {
  const [showTable, setShowTable] = useState(false);
  return (
    <Card className="min-w-0">
      <CardHeader className="flex-row items-start justify-between gap-2 space-y-0">
        <div className="min-w-0">
          <CardTitle>{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </div>
        {!empty && (
          <Button variant="ghost" size="sm" onClick={() => setShowTable((s) => !s)} aria-pressed={showTable} aria-label={showTable ? "Tampilan grafik" : "Tampilan tabel"}>
            {showTable ? <BarChart3 /> : <Table2 />}
          </Button>
        )}
      </CardHeader>
      <CardContent>{empty ? <EmptyState title="Belum ada data untuk periode ini" /> : showTable ? <div className="max-h-72 overflow-auto">{table}</div> : children}</CardContent>
    </Card>
  );
}

function SimpleTable({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <table className="w-full text-sm tabular">
      <thead><tr className="border-b">{head.map((h, i) => <th key={h} className={`py-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground ${i ? "text-right" : "text-left"}`}>{h}</th>)}</tr></thead>
      <tbody>{rows.map((r, i) => <tr key={i} className="border-b last:border-0">{r.map((c, j) => <td key={j} className={`py-1.5 ${j ? "text-right" : ""}`}>{c}</td>)}</tr>)}</tbody>
    </table>
  );
}

const tooltipStyle = { borderRadius: 10, border: "1px solid #dce3ee", boxShadow: "0 4px 16px rgba(16,38,90,.08)", fontSize: 12 };

/** Stacked daily totals per series (e.g. earnings by commission source). */
export function StackedTimeChart({ title, description, data, series, format = "money" }: {
  title: string; description?: string; data: Record<string, number | string>[]; series: { key: string; label: string }[]; format?: Fmt;
}) {
  const empty = data.length === 0;
  return (
    <ChartFrame
      title={title}
      description={description}
      empty={empty}
      table={<SimpleTable head={["Tanggal", ...series.map((s) => s.label)]} rows={data.map((d) => [String(d.day), ...series.map((s) => fmt(Number(d[s.key] ?? 0), format))])} />}
    >
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="day" tickFormatter={shortDay} tick={AXIS} axisLine={false} tickLine={false} minTickGap={12} />
            <YAxis tickFormatter={(v) => fmtAxis(v, format)} tick={AXIS} axisLine={false} tickLine={false} width={64} />
            <Tooltip cursor={{ fill: "rgba(42,120,214,.06)" }} contentStyle={tooltipStyle} formatter={(v: number, n: string) => [fmt(v, format), series.find((s) => s.key === n)?.label ?? n]} />
            {series.length > 1 && <Legend formatter={(v) => <span className="text-xs text-foreground">{series.find((s) => s.key === v)?.label ?? v}</span>} iconType="circle" iconSize={8} />}
            {series.map((s, i) => (
              <Bar isAnimationActive={false} key={s.key} dataKey={s.key} stackId="a" fill={SERIES[i % SERIES.length]} stroke="#ffffff" strokeWidth={1} maxBarSize={28} radius={i === series.length - 1 ? [4, 4, 0, 0] : 0} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartFrame>
  );
}

/** One or two lines over time with crosshair tooltip. */
export function LineTimeChart({ title, description, data, series, format = "number" }: {
  title: string; description?: string; data: Record<string, number | string>[]; series: { key: string; label: string }[]; format?: Fmt;
}) {
  return (
    <ChartFrame
      title={title}
      description={description}
      empty={data.length === 0}
      table={<SimpleTable head={["Tanggal", ...series.map((s) => s.label)]} rows={data.map((d) => [String(d.day), ...series.map((s) => fmt(Number(d[s.key] ?? 0), format))])} />}
    >
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="day" tickFormatter={shortDay} tick={AXIS} axisLine={false} tickLine={false} minTickGap={12} />
            <YAxis tickFormatter={(v) => fmtAxis(v, format)} tick={AXIS} axisLine={false} tickLine={false} width={56} allowDecimals={false} />
            <Tooltip contentStyle={tooltipStyle} cursor={{ stroke: "#9aa6ba", strokeDasharray: "3 3" }} formatter={(v: number, n: string) => [fmt(v, format), series.find((s) => s.key === n)?.label ?? n]} />
            {series.length > 1 && <Legend formatter={(v) => <span className="text-xs text-foreground">{series.find((s) => s.key === v)?.label ?? v}</span>} iconType="plainline" />}
            {series.map((s, i) => (
              <Line isAnimationActive={false} key={s.key} type="monotone" dataKey={s.key} stroke={SERIES[i]} strokeWidth={2} dot={false} activeDot={{ r: 5, stroke: "#fff", strokeWidth: 2 }} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </ChartFrame>
  );
}

/** Horizontal bars, single series (one colour for every bar — nominal categories). */
export function HBarChart({ title, description, data, label, format = "number", ordinal = false }: {
  title: string; description?: string; data: { name: string; value: number }[]; label: string; format?: Fmt; ordinal?: boolean;
}) {
  const h = Math.max(160, data.length * 36 + 24);
  return (
    <ChartFrame title={title} description={description} empty={data.length === 0} table={<SimpleTable head={["", label]} rows={data.map((d) => [d.name, fmt(d.value, format)])} />}>
      <div style={{ height: h }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 0, right: 56, left: 8, bottom: 0 }}>
            <CartesianGrid stroke={GRID} horizontal={false} />
            <XAxis type="number" tickFormatter={(v) => fmtAxis(v, format)} tick={AXIS} axisLine={false} tickLine={false} allowDecimals={false} />
            <YAxis type="category" dataKey="name" tick={{ ...AXIS, fill: "#1f2a44" }} axisLine={false} tickLine={false} width={130} />
            <Tooltip cursor={{ fill: "rgba(42,120,214,.06)" }} contentStyle={tooltipStyle} formatter={(v: number) => [fmt(v, format), label]} />
            <Bar isAnimationActive={false} dataKey="value" fill={SERIES[0]} radius={[0, 4, 4, 0]} maxBarSize={22} label={{ position: "right", fontSize: 11, fill: "#1f2a44", formatter: (v: number) => fmtAxis(v, format) }}>
              {ordinal && data.map((_, i) => <Cell key={i} fill={ORDINAL[Math.min(i, ORDINAL.length - 1)]} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartFrame>
  );
}
