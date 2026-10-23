"use client";
import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CopyButton } from "./copy-button";
import { useI18n } from "@/lib/i18n/client";

export function ReferralShare({ code, link, compact }: { code: string; link: string; compact?: boolean }) {
  const { t } = useI18n();
  const message = `${t.agent.inviteMessage} ${code}: ${link}\n\n${t.agent.inviteDisclaimer}`;
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-lg bg-secondary px-3 py-1.5 font-mono text-lg font-bold tracking-widest text-navy-800" data-testid="referral-code">{code}</span>
        <CopyButton text={code} label={t.common.copy} copiedLabel={t.common.copied} />
      </div>
      <div className="flex min-w-0 items-center gap-2 rounded-lg border bg-background px-3 py-2">
        <span className="min-w-0 flex-1 truncate font-mono text-xs" title={link}>{link}</span>
        <CopyButton text={link} label={t.common.copy} copiedLabel={t.common.copied} />
      </div>
      {!compact && <p className="whitespace-pre-wrap rounded-lg border bg-background p-3 text-xs text-muted-foreground">{message}</p>}
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="success" size="sm">
          <a href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noopener noreferrer"><MessageCircle />{t.agent.shareWhatsapp}</a>
        </Button>
        <CopyButton text={message} label={`${t.common.copy} pesan`} copiedLabel={t.common.copied} />
      </div>
    </div>
  );
}
