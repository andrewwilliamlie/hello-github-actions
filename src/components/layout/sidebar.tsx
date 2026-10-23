"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  LayoutDashboard, ListChecks, Store, Wallet, Coins, Users, Bell, UserCircle, ClipboardList, ShoppingCart, Package, Boxes, Scale, ArrowLeftRight,
  Upload, GitCompare, HandCoins, Banknote, Gavel, ShieldAlert, FileBarChart, Mail, Webhook, ScrollText, Settings, UserCog, Network, Circle, Menu,
} from "lucide-react";

const ICONS = {
  LayoutDashboard, ListChecks, Store, Wallet, Coins, Users, Bell, UserCircle, ClipboardList, ShoppingCart, Package, Boxes, Scale, ArrowLeftRight,
  Upload, GitCompare, HandCoins, Banknote, Gavel, ShieldAlert, FileBarChart, Mail, Webhook, ScrollText, Settings, UserCog, Network, Circle,
};
export type IconName = keyof typeof ICONS;
import { cn } from "@/lib/utils";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export interface NavItem { href: string; label: string; icon: IconName; badge?: number }
export interface NavGroup { label?: string; items: NavItem[] }

function Brand({ portalLabel }: { portalLabel: string }) {
  return (
    <div className="flex items-center gap-2.5 px-4 py-5">
      <svg viewBox="0 0 32 32" className="size-9 shrink-0" aria-hidden><rect width="32" height="32" rx="9" fill="#59b0ff" /><path d="M9 8v16M23 8v16M9 16h14" stroke="#0b1b42" strokeWidth="3.4" strokeLinecap="round" /></svg>
      <div className="min-w-0">
        <div className="truncate text-sm font-extrabold tracking-tight text-white">HAUSJO AGENT NETWORK</div>
        <div className="truncate text-xs text-sky-200/80">{portalLabel}</div>
      </div>
    </div>
  );
}

function NavList({ groups, onNavigate }: { groups: NavGroup[]; onNavigate?: () => void }) {
  const path = usePathname();
  const active = (href: string) => {
    const all = groups.flatMap((g) => g.items.map((i) => i.href));
    const best = all.filter((h) => path === h || path.startsWith(h + "/")).sort((a, b) => b.length - a.length)[0];
    return best === href;
  };
  return (
    <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-6" aria-label="Navigasi utama">
      {groups.map((g, gi) => (
        <div key={gi}>
          {g.label && <div className="px-3 pb-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-sky-200/60">{g.label}</div>}
          <ul className="space-y-0.5">
            {g.items.map((item) => {
              const Icon = ICONS[item.icon] ?? Circle;
              const isActive = active(item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={isActive ? "page" : undefined}
                    className={cn("flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors", isActive ? "bg-white/12 text-white shadow-inner bg-sky-400/15" : "text-sky-100/80 hover:bg-white/5 hover:text-white")}
                  >
                    <Icon className={cn("size-4 shrink-0", isActive ? "text-sky-300" : "")} />
                    <span className="truncate">{item.label}</span>
                    {!!item.badge && <span className="ml-auto rounded-full bg-sky-400 px-1.5 text-[10px] font-bold text-navy-950">{item.badge}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function Sidebar({ groups, portalLabel }: { groups: NavGroup[]; portalLabel: string }) {
  return (
    <aside className="no-print sticky top-0 hidden h-screen w-64 shrink-0 flex-col bg-navy-900 lg:flex">
      <Brand portalLabel={portalLabel} />
      <NavList groups={groups} />
    </aside>
  );
}

export function MobileNav({ groups, portalLabel }: { groups: NavGroup[]; portalLabel: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setOpen(true)} aria-label="Buka menu">
        <Menu className="size-5" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Menu" side="left" className="bg-navy-900">
          <Brand portalLabel={portalLabel} />
          <NavList groups={groups} onNavigate={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
    </>
  );
}
