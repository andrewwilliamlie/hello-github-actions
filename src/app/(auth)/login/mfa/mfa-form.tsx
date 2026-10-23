"use client";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Alert } from "@/components/ui/misc";
import { verifyMfaAction } from "../../actions";
import { Loader2 } from "lucide-react";

export function MfaForm({ label, button }: { label: string; button: string }) {
  const [state, action, pending] = useActionState(verifyMfaAction, null);
  return (
    <form action={action} className="grid gap-4">
      {state && !state.ok && <Alert variant="danger">{state.error}</Alert>}
      <Field label={label} htmlFor="code">
        <Input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required className="text-center font-mono text-lg tracking-[0.4em]" />
      </Field>
      <Button type="submit" size="lg" disabled={pending}>
        {pending && <Loader2 className="animate-spin" />}
        {button}
      </Button>
    </form>
  );
}
