import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export const MERCHANT_STAGES = ["LEAD", "CONTACTED", "APPLICATION_SUBMITTED", "UNDER_REVIEW", "APPROVED", "PAYMENT_VERIFIED", "DEVICE_ASSIGNED", "ACTIVATED", "COMMISSION_ELIGIBLE"] as const;
const TERMINAL_BAD = ["REJECTED", "CANCELLED", "REFUNDED", "SUSPENDED"];

/** Unified onboarding pipeline from lead + merchant status. */
export function effectiveStage(leadStatus: string, merchantStatus?: string | null): string {
  if (merchantStatus) return merchantStatus;
  if (leadStatus === "REVISION_REQUESTED") return "REVISION_REQUESTED";
  return leadStatus;
}

export function StageTimeline({ stage, labels }: { stage: string; labels: Record<string, string> }) {
  const idx = MERCHANT_STAGES.indexOf(stage as (typeof MERCHANT_STAGES)[number]);
  const revision = stage === "REVISION_REQUESTED";
  const current = revision ? MERCHANT_STAGES.indexOf("UNDER_REVIEW") : idx;
  const bad = TERMINAL_BAD.includes(stage);
  return (
    <div>
      {(bad || revision) && (
        <p className={cn("mb-3 text-sm font-semibold", bad ? "text-destructive" : "text-amber-800")}>{labels[stage] ?? stage}</p>
      )}
      <ol className="flex flex-wrap gap-y-3" aria-label="Tahapan onboarding">
        {MERCHANT_STAGES.map((s, i) => {
          const done = !bad && current >= 0 && i < current;
          const isCurrent = !bad && i === current;
          return (
            <li key={s} className="flex items-center" aria-current={isCurrent ? "step" : undefined}>
              <div className="flex items-center gap-2">
                <span className={cn("grid size-6 shrink-0 place-items-center rounded-full border-2 text-[10px] font-bold", done ? "border-navy-700 bg-navy-700 text-white" : isCurrent ? "border-sky-500 bg-sky-50 text-navy-800" : "border-border bg-card text-muted-foreground")}>
                  {done ? <Check className="size-3.5" /> : i + 1}
                </span>
                <span className={cn("text-xs", isCurrent ? "font-bold text-navy-900" : "text-muted-foreground")}>{labels[s] ?? s}</span>
              </div>
              {i < MERCHANT_STAGES.length - 1 && <span className={cn("mx-2 h-0.5 w-5", done ? "bg-navy-700" : "bg-border")} aria-hidden />}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
