import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

export const badgeVariants = cva("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap", {
  variants: {
    variant: {
      default: "bg-secondary text-secondary-foreground",
      success: "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200",
      warning: "bg-amber-50 text-amber-900 ring-1 ring-amber-200",
      danger: "bg-red-50 text-red-800 ring-1 ring-red-200",
      info: "bg-sky-50 text-navy-800 ring-1 ring-sky-200",
      muted: "bg-muted text-muted-foreground",
      demo: "bg-violet-50 text-violet-800 ring-1 ring-violet-200 uppercase tracking-wide",
      mock: "bg-orange-50 text-orange-800 ring-1 ring-orange-200 uppercase tracking-wide",
    },
  },
  defaultVariants: { variant: "default" },
});

export function Badge({ className, variant, ...props }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
