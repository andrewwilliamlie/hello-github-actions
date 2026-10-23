"use client";
import { useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type FormAction = (form: FormData) => Promise<{ ok: boolean; error?: string; message?: string; data?: unknown }>;

/** Plain <form> (supports file inputs) posting FormData to a server action, with toast feedback. */
export function ActionForm({
  action, hidden = {}, submitLabel, children, className, variant, resetOnSuccess = true, onSuccess, submitClassName, redirectTo,
}: {
  action: FormAction; hidden?: Record<string, string>; submitLabel: string; children?: React.ReactNode; className?: string; variant?: ButtonProps["variant"];
  resetOnSuccess?: boolean; onSuccess?: (data: unknown) => void; submitClassName?: string; redirectTo?: string;
}) {
  const [pending, start] = useTransition();
  const ref = useRef<HTMLFormElement>(null);
  const router = useRouter();
  return (
    <form
      ref={ref}
      className={cn("grid gap-4", className)}
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        for (const [k, v] of Object.entries(hidden)) fd.set(k, v);
        start(async () => {
          const res = await action(fd);
          if (res.ok) {
            toast.success(res.message ?? "Berhasil disimpan");
            if (resetOnSuccess) ref.current?.reset();
            onSuccess?.(res.data);
            if (redirectTo) router.push(redirectTo);
            else router.refresh();
          } else toast.error(res.error ?? "Gagal");
        });
      }}
    >
      {children}
      <div>
        <Button type="submit" variant={variant} disabled={pending} className={submitClassName}>
          {pending && <Loader2 className="animate-spin" />}
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
