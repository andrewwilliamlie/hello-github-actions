"use client";
import * as DM from "@radix-ui/react-dropdown-menu";
import { cn } from "@/lib/utils";

export const DropdownMenu = DM.Root;
export const DropdownMenuTrigger = DM.Trigger;
export function DropdownMenuContent({ className, children, align = "end" }: { className?: string; children: React.ReactNode; align?: "start" | "end" }) {
  return (
    <DM.Portal>
      <DM.Content align={align} sideOffset={6} className={cn("z-50 min-w-[12rem] rounded-xl border bg-popover p-1 shadow-lg", className)}>
        {children}
      </DM.Content>
    </DM.Portal>
  );
}
export function DropdownMenuItem({ className, ...p }: React.ComponentPropsWithoutRef<typeof DM.Item>) {
  return <DM.Item className={cn("flex cursor-pointer select-none items-center gap-2 rounded-lg px-3 py-2 text-sm outline-none data-[highlighted]:bg-accent", className)} {...p} />;
}
export const DropdownMenuSeparator = () => <DM.Separator className="my-1 h-px bg-border" />;
export const DropdownMenuLabel = ({ children }: { children: React.ReactNode }) => <DM.Label className="px-3 py-2 text-xs text-muted-foreground">{children}</DM.Label>;
