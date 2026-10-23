import { Users } from "lucide-react";
import { formatRupiah } from "@/lib/money";
import { StatusBadge } from "@/components/ui/status-badge";
import type { NetworkNode } from "@/server/modules/referrals";

export function NetworkTree({ nodes, labels, rootLabel }: { nodes: NetworkNode[]; labels: Record<string, string>; rootLabel: string }) {
  const render = (list: NetworkNode[]) => (
    <ul className="ml-3 space-y-2 border-l-2 border-sky-200 pl-4">
      {list.map((n) => (
        <li key={n.agentId}>
          <div className={`rounded-lg border p-3 text-sm ${n.level === 1 ? "bg-card" : "bg-muted/40"}`}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">{n.name}</span>
              <span className="font-mono text-xs text-muted-foreground">{n.agentCode}</span>
              <StatusBadge status={n.status} label={labels[n.status]} />
              <span className="text-xs text-muted-foreground">Level {n.level}{n.level > 1 ? " · informasi saja" : ""}</span>
            </div>
            <div className="mt-1 flex flex-wrap gap-x-4 text-xs text-muted-foreground">
              <span>{n.merchants} merchant</span>
              <span>{n.txns30d.toLocaleString("id-ID")} transaksi (30 hari)</span>
              {n.level === 1 && <span className="font-semibold text-navy-800">Bagi hasil Anda: {formatRupiah(n.earningsForReferrer)}</span>}
            </div>
          </div>
          {n.children.length > 0 && <div className="mt-2">{render(n.children)}</div>}
        </li>
      ))}
    </ul>
  );
  return (
    <div>
      <div className="mb-2 flex items-center gap-2 text-sm font-bold"><Users className="size-4" />{rootLabel}</div>
      {nodes.length ? render(nodes) : <p className="text-sm text-muted-foreground">Belum ada rekrutan.</p>}
    </div>
  );
}
