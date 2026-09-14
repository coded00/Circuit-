"use client";

/**
 * Circuit — admin control-center sidebar. Deliberately flat and short:
 * the 9 sections from the product spec, one level each, no disclosure
 * menus — "open it every morning and immediately understand it." Always
 * rendered inside the `data-surface="dark"` scope `/admin/layout.tsx`
 * sets on the whole section, so every token here (`bg-surface`,
 * `text-muted`, `border-border`, ...) is already the dark palette by the
 * time it reaches this component — same mechanism the player sidebar's
 * own dark rail already uses, not a second theme system.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Trophy,
  Swords,
  Gamepad2,
  Newspaper,
  Banknote,
  Calendar,
  Settings,
} from "lucide-react";

const ITEMS = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/competitions", label: "Competitions", icon: Trophy },
  { href: "/admin/challenges", label: "Challenges", icon: Swords },
  { href: "/admin/games", label: "Games", icon: Gamepad2 },
  { href: "/admin/content", label: "Content", icon: Newspaper },
  { href: "/admin/finance", label: "Finance", icon: Banknote },
  { href: "/admin/calendar", label: "Calendar", icon: Calendar },
  { href: "/admin/settings", label: "Settings", icon: Settings },
] as const;

function isActive(pathname: string, href: string): boolean {
  return href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 flex h-screen w-[220px] shrink-0 flex-col gap-1 border-r border-border bg-background px-3 py-6">
      <Link href="/admin" className="mb-8 flex items-center gap-2 px-2">
        {/* eslint-disable-next-line @next/next/no-img-element -- local /public asset, no next/image usage elsewhere in this codebase */}
        <img src="/circuit-logo.png" alt="Circuit" width={700} height={347} className="h-6 w-auto max-w-none" />
        <span className="text-eyebrow text-muted-strong">Control Center</span>
      </Link>

      <nav className="flex flex-col gap-0.5">
        {ITEMS.map((item) => {
          const active = isActive(pathname, item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`flex h-10 items-center gap-3 rounded-[9px] px-3 text-sm font-medium transition ${
                active ? "bg-accent-volt text-accent-volt-foreground" : "text-muted hover:bg-surface-elevated hover:text-foreground"
              }`}
            >
              <Icon size={17} className={active ? "text-accent-volt-foreground" : undefined} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto flex flex-col gap-1 border-t border-border px-2 pt-4">
        <Link href="/" className="text-xs font-medium text-muted-strong transition hover:text-foreground">
          ← Back to Circuit
        </Link>
      </div>
    </aside>
  );
}
