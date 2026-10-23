import Link from "next/link";
import type { Notification } from "@prisma/client";
import type { Dictionary } from "@/lib/i18n/id";
import { formatDateTime } from "@/lib/time";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { ActionButton, type ServerAction } from "./action-button";
import { cn } from "@/lib/utils";

export function NotificationList({ items, t, locale, markAll }: { items: Notification[]; t: Dictionary; locale: string; markAll: ServerAction }) {
  return (
    <>
      <PageHeader title={t.common.notifications} actions={items.some((i) => !i.readAt) ? <ActionButton action={markAll} label={t.common.markAllRead} variant="outline" /> : undefined} />
      <Card>
        <CardContent className="p-0">
          {items.length === 0 ? <EmptyState title="Tidak ada notifikasi" /> : (
            <ul className="divide-y">
              {items.map((n) => (
                <li key={n.id} className={cn("flex gap-3 p-4", !n.readAt && "bg-sky-50/60")}>
                  <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.readAt ? "bg-transparent" : "bg-sky-500")} aria-label={n.readAt ? undefined : "Belum dibaca"} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="font-semibold">{n.link ? <Link href={n.link} className="hover:underline">{n.title}</Link> : n.title}</p>
                      <time className="text-xs text-muted-foreground">{formatDateTime(n.createdAt, locale)}</time>
                    </div>
                    <p className="text-sm text-muted-foreground">{n.body}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}
