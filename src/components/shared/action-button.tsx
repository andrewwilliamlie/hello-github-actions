"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field } from "@/components/ui/label";
import { Input, Textarea } from "@/components/ui/input";
import { Loader2 } from "lucide-react";

export type ServerAction = (input: Record<string, string>) => Promise<{ ok: boolean; error?: string; message?: string; data?: unknown }>;

interface Props {
  action: ServerAction;
  args?: Record<string, string>;
  label: string;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  confirmTitle?: string;
  confirmBody?: string;
  /** Ask for a free-text reason (sent as `reason`). */
  reason?: { label: string; minLength?: number; placeholder?: string };
  /** Extra single-line input (sent as `value`). */
  input?: { label: string; placeholder?: string; type?: string; defaultValue?: string; name?: string };
  successMessage?: string;
  icon?: React.ReactNode;
  onDone?: (data: unknown) => void;
  disabled?: boolean;
  className?: string;
}

/** Button that runs a server action, optionally behind a confirmation dialog with reason input. */
export function ActionButton({ action, args = {}, label, variant, size = "sm", confirmTitle, confirmBody, reason, input, successMessage, icon, onDone, disabled, className }: Props) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [reasonText, setReason] = useState("");
  const [value, setValue] = useState(input?.defaultValue ?? "");
  const router = useRouter();
  const needsDialog = !!(confirmTitle || reason || input);
  const minLen = reason?.minLength ?? 0;

  const run = () =>
    start(async () => {
      const res = await action({ ...args, ...(reason ? { reason: reasonText } : {}), ...(input ? { [input.name ?? "value"]: value } : {}) });
      if (res.ok) {
        toast.success(res.message ?? successMessage ?? "Berhasil");
        setOpen(false);
        setReason("");
        onDone?.(res.data);
        router.refresh();
      } else toast.error(res.error ?? "Gagal");
    });

  const btn = (
    <Button variant={variant} size={size} disabled={pending || disabled} onClick={needsDialog ? undefined : run} className={className}>
      {pending ? <Loader2 className="animate-spin" /> : icon}
      {label}
    </Button>
  );
  if (!needsDialog) return btn;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{btn}</DialogTrigger>
      <DialogContent title={confirmTitle ?? label} description={confirmBody}>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            run();
          }}
        >
          {input && (
            <Field label={input.label} htmlFor="action-input">
              <Input id="action-input" type={input.type ?? "text"} placeholder={input.placeholder} value={value} onChange={(e) => setValue(e.target.value)} required />
            </Field>
          )}
          {reason && (
            <Field label={reason.label} htmlFor="action-reason" hint={minLen ? `Minimal ${minLen} karakter` : undefined}>
              <Textarea id="action-reason" value={reasonText} onChange={(e) => setReason(e.target.value)} placeholder={reason.placeholder} required={minLen > 0} minLength={minLen} />
            </Field>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Batal</Button>
            <Button type="submit" variant={variant} disabled={pending || reasonText.trim().length < minLen}>
              {pending && <Loader2 className="animate-spin" />}
              {label}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
