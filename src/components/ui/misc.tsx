import * as React from "react";
import { cn } from "@/lib/utils";
import { Inbox } from "lucide-react";

export function Skeleton({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("relative overflow-hidden rounded-md bg-muted before:absolute before:inset-0 before:-translate-x-full before:animate-[shimmer_1.5s_infinite] before:bg-gradient-to-r before:from-transparent before:via-white/60 before:to-transparent", className)} aria-hidden {...p} />;
}

export function Separator({ className }: { className?: string }) {
  return <hr className={cn("border-border", className)} />;
}

export function EmptyState({ title, body, action, icon }: { title: string; body?: string; action?: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center">
      <div className="grid size-12 place-items-center rounded-full bg-secondary text-navy-700">{icon ?? <Inbox className="size-6" aria-hidden />}</div>
      <p className="text-base font-bold">{title}</p>
      {body && <p className="max-w-md text-sm text-muted-foreground">{body}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function PageHeader({ title, description, actions, eyebrow }: { title: string; description?: React.ReactNode; actions?: React.ReactNode; eyebrow?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{eyebrow}</div>}
        <h1 className="text-2xl font-extrabold tracking-tight text-navy-900 text-balance">{title}</h1>
        {description && <div className="mt-1 max-w-3xl text-sm text-muted-foreground">{description}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Kpi({ label, value, hint, highlight, icon }: { label: string; value: React.ReactNode; hint?: React.ReactNode; highlight?: boolean; icon?: React.ReactNode }) {
  return (
    <div className={cn("min-w-0 rounded-xl border p-4 shadow-sm", highlight ? "border-navy-800 bg-navy-800 text-white" : "bg-card")}>
      <div className={cn("flex items-center justify-between gap-2 text-[11px] font-bold uppercase tracking-wider", highlight ? "text-sky-200" : "text-muted-foreground")}>
        <span className="line-clamp-2" title={label}>{label}</span>
        {icon}
      </div>
      <div className="mt-1.5 break-words text-[clamp(1.15rem,1.5vw,1.5rem)] font-extrabold leading-tight tabular">{value}</div>
      {hint && <div className={cn("mt-0.5 text-xs", highlight ? "text-sky-100/80" : "text-muted-foreground")}>{hint}</div>}
    </div>
  );
}

export function DescriptionList({ items, className }: { items: { label: string; value: React.ReactNode }[]; className?: string }) {
  return (
    <dl className={cn("grid gap-x-6 gap-y-3 sm:grid-cols-2", className)}>
      {items.map((i) => (
        <div key={i.label} className="min-w-0">
          <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{i.label}</dt>
          <dd className="mt-0.5 break-words text-sm font-medium">{i.value ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Alert({ variant = "info", title, children }: { variant?: "info" | "warning" | "danger" | "success"; title?: string; children?: React.ReactNode }) {
  const styles = { info: "border-sky-200 bg-sky-50 text-navy-900", warning: "border-amber-200 bg-amber-50 text-amber-950", danger: "border-red-200 bg-red-50 text-red-900", success: "border-emerald-200 bg-emerald-50 text-emerald-900" }[variant];
  return (
    <div role={variant === "danger" ? "alert" : "status"} className={cn("rounded-xl border px-4 py-3 text-sm", styles)}>
      {title && <p className="font-bold">{title}</p>}
      {children && <div className={title ? "mt-0.5" : ""}>{children}</div>}
    </div>
  );
}
