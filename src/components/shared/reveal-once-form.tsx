"use client";
import { useState } from "react";
import { ActionForm, type FormAction } from "./action-form";
import { Alert } from "@/components/ui/misc";
import { CopyButton } from "./copy-button";

/** Form whose result contains secrets shown exactly once (API keys, temporary passwords). */
export function RevealOnceForm({ action, hidden, submitLabel, children, labels }: { action: FormAction; hidden?: Record<string, string>; submitLabel: string; children?: React.ReactNode; labels: Record<string, string> }) {
  const [secret, setSecret] = useState<Record<string, string> | null>(null);
  return (
    <div className="grid gap-4">
      {secret && (
        <Alert variant="warning" title="Simpan sekarang — tidak akan ditampilkan lagi">
          <div className="mt-2 grid gap-2">
            {Object.entries(secret).map(([k, v]) => (
              <div key={k} className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold">{labels[k] ?? k}:</span>
                <code className="break-all rounded bg-white px-2 py-1 font-mono text-xs" data-testid={`secret-${k}`}>{v}</code>
                <CopyButton text={v} />
              </div>
            ))}
          </div>
        </Alert>
      )}
      <ActionForm action={action} hidden={hidden} submitLabel={submitLabel} onSuccess={(d) => setSecret(d as Record<string, string>)}>
        {children}
      </ActionForm>
    </div>
  );
}
