"use client";
import Link from "next/link";
import { LogOut, User } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown";
import { initials } from "@/lib/utils";

export function UserMenu({ name, email, roleLabel, profileHref, logout, logoutLabel }: { name: string; email: string; roleLabel: string; profileHref?: string; logout: () => Promise<void>; logoutLabel: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-2 rounded-full p-0.5 pr-2 hover:bg-muted" aria-label="Menu pengguna">
        <span className="grid size-8 place-items-center rounded-full bg-navy-800 text-xs font-bold text-white">{initials(name)}</span>
        <span className="hidden max-w-[10rem] truncate text-sm font-semibold sm:block">{name}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel>
          <div className="font-semibold text-foreground">{name}</div>
          <div className="truncate">{email}</div>
          <div className="mt-1 text-[10px] font-bold uppercase tracking-wider text-navy-700">{roleLabel}</div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {profileHref && (
          <DropdownMenuItem asChild>
            <Link href={profileHref}><User className="size-4" /> Profil</Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={() => void logout()}>
          <LogOut className="size-4" /> {logoutLabel}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
