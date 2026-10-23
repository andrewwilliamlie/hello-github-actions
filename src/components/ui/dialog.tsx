"use client";
import * as React from "react";
import * as D from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;

export function DialogContent({ className, children, title, description, side }: { className?: string; children: React.ReactNode; title: string; description?: string; side?: "left" }) {
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-50 bg-navy-950/50 backdrop-blur-[1px]" />
      <D.Content
        className={cn(
          side === "left"
            ? "fixed inset-y-0 left-0 z-50 w-[85vw] max-w-xs overflow-y-auto bg-card p-0 shadow-xl focus:outline-none"
            : "fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border bg-card p-6 shadow-xl focus:outline-none",
          className,
        )}
      >
        <div className={cn("mb-4 flex items-start justify-between gap-4", side === "left" && "sr-only")}>
          <div>
            <D.Title className="text-lg font-bold">{title}</D.Title>
            {description ? <D.Description className="mt-1 text-sm text-muted-foreground">{description}</D.Description> : <D.Description className="sr-only">{title}</D.Description>}
          </div>
          <D.Close className="rounded-md p-1 text-muted-foreground hover:bg-muted" aria-label="Tutup">
            <X className="size-5" />
          </D.Close>
        </div>
        {children}
      </D.Content>
    </D.Portal>
  );
}
