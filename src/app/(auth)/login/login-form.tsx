"use client";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Alert } from "@/components/ui/misc";
import { loginAction } from "../actions";
import { Loader2 } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";

export function LoginForm() {
  const { t } = useI18n();
  const [state, action, pending] = useActionState(loginAction, null);
  return (
    <form action={action} className="grid gap-4">
      {state && !state.ok && <Alert variant="danger">{state.error}</Alert>}
      <Field label={t.auth.identifier} htmlFor="identifier">
        <Input id="identifier" name="identifier" autoComplete="username" required />
      </Field>
      <Field label={t.auth.password} htmlFor="password">
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </Field>
      <Button type="submit" size="lg" disabled={pending}>
        {pending && <Loader2 className="animate-spin" />}
        {t.auth.loginButton}
      </Button>
    </form>
  );
}
