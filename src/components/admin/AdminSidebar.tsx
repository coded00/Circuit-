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
 *
 * Responsive tiers mirror AppSidebar.tsx exactly: hidden below `sm` (the
 * hamburger-triggered drawer in AdminMobileNav.tsx covers mobile instead,
 * reusing this same ADMIN_NAV_ITEMS list — 9 flat, equally-weighted
 * sections don't split cleanly into a "primary 5" the way the player
 * app's nav does, so mobile gets the same full list, not a subset), a
 * 64px icon-only rail between `sm` and `lg`, the full 220px labeled rail
 * at `lg`+.
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

export const ADMIN_NAV_ITEMS = [
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

export function isAdminNavActive(pathname: string, href: string): boolean {
  return href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(`${href}/`);
}

/** Row height (40px) + the nav's own gap-0.5 (2px) — same index-arithmetic
 *  sliding-indicator approach as AppSidebar.tsx, see that file's comment. */
const NAV_ROW_STEP = 42;

export function AdminSidebar() {
  const pathname = usePathname();
  const activeIndex = ADMIN_NAV_ITEMS.findIndex((item) => isAdminNavActive(pathname, item.href));

  return (
    <aside className="sticky top-0 hidden h-screen w-16 shrink-0 flex-col gap-1 border-r border-border bg-background px-2 py-6 sm:flex lg:w-[220px] lg:px-3">
      <Link href="/admin" className="mb-8 flex items-center justify-center gap-2 px-2 lg:justify-start">
        {/* eslint-disable-next-line @next/next/no-img-element -- local /public asset, no next/image usage elsewhere in this codebase */}
        <img src="/circuit-logo.png" alt="Circuit" width={700} height={347} className="h-6 w-auto max-w-none" />
        <span className="text-eyebrow hidden text-muted-strong lg:inline">Control Center</span>
      </Link>

      <nav className="relative flex flex-col gap-0.5">
        {activeIndex !== -1 && (
          <span
            aria-hidden
            className="absolute inset-x-0 z-0 h-10 rounded-[9px] bg-accent-volt transition-transform duration-[var(--duration-base)] ease-[var(--ease-out)]"
            style={{ transform: `translateY(${activeIndex * NAV_ROW_STEP}px)` }}
          />
        )}
        {ADMIN_NAV_ITEMS.map((item, i) => {
          const active = i === activeIndex;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.label}
              aria-current={active ? "page" : undefined}
              className={`relative z-10 flex h-10 items-center justify-center gap-3 rounded-[9px] px-3 text-sm font-medium transition-colors duration-[var(--duration-fast)] lg:justify-start ${
                active ? "text-accent-volt-foreground" : "text-muted hover:bg-surface-elevated hover:text-foreground"
              }`}
            >
              <Icon size={17} className={active ? "text-accent-volt-foreground" : undefined} />
              <span className="hidden lg:inline">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto flex flex-col gap-1 border-t border-border px-2 pt-4">
        <Link
          href="/"
          title="Back to Circuit"
          className="flex items-center justify-center text-xs font-medium text-muted-strong transition hover:text-foreground lg:justify-start"
        >
          <span className="lg:hidden">←</span>
          <span className="hidden lg:inline">← Back to Circuit</span>
        </Link>
      </div>
    </aside>
  );
}
