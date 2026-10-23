"use client";
import { useEffect, useState } from "react";
import { beginMfaSetupAction } from "../../../actions";
import { MfaForm } from "../mfa-form";
import { Alert, Skeleton } from "@/components/ui/misc";

export function MfaSetupClient({ codeLabel, button, secretLabel }: { codeLabel: string; button: string; secretLabel: string }) {
  const [data, setData] = useState<{ secret: string; qr: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    beginMfaSetupAction().then((r) => (r.ok && r.data ? setData(r.data as { secret: string; qr: string }) : setError(r.ok ? "Gagal" : r.error)));
  }, []);
  if (error) return <Alert variant="danger">{error}</Alert>;
  return (
    <div className="grid gap-5">
      <div className="flex justify-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {data ? <img src={data.qr} alt="QR code autentikator" width={200} height={200} className="rounded-lg border" /> : <Skeleton className="size-[200px]" />}
      </div>
      {data && (
        <div className="text-center text-xs text-muted-foreground">
          {secretLabel}: <code className="select-all break-all font-mono text-foreground" data-testid="mfa-secret">{data.secret}</code>
        </div>
      )}
      <MfaForm label={codeLabel} button={button} />
    </div>
  );
}
