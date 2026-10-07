"use client";

/**
 * Circuit — admin control-center sidebar. Flat and short: the sections
 * in three labelled groups (Operate / Catalog / Platform), one level
 * each, no disclosure menus. The active item is a quiet raised row with
 * a thin volt marker — volt stays reserved for primary actions. Always
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
  MessagesSquare,
  Scale,
  Flag,
  Store,
  BadgeCheck,
  ShieldAlert,
  type LucideIcon,
} from "lucide-react";

type AdminNavItem = { href: string; label: string; icon: LucideIcon };

export const ADMIN_NAV_GROUPS: { label: string; items: AdminNavItem[] }[] = [
  {
    label: "Operate",
    items: [
      { href: "/admin", label: "Overview", icon: LayoutDashboard },
      { href: "/admin/users", label: "Users", icon: Users },
      { href: "/admin/competitions", label: "Competitions", icon: Trophy },
      { href: "/admin/challenges", label: "Challenges", icon: Swords },
      { href: "/admin/communities", label: "Communities", icon: MessagesSquare },
      { href: "/admin/disputes", label: "Disputes", icon: Scale },
      { href: "/admin/reports", label: "Reports", icon: Flag },
      { href: "/admin/stakes", label: "Stakes", icon: ShieldAlert },
    ],
  },
  {
    label: "Catalog",
    items: [
      { href: "/admin/games", label: "Games", icon: Gamepad2 },
      { href: "/admin/marketplace", label: "Marketplace", icon: Store },
      { href: "/admin/content", label: "Content", icon: Newspaper },
      { href: "/admin/calendar", label: "Calendar", icon: Calendar },
    ],
  },
  {
    label: "Platform",
    items: [
      { href: "/admin/finance", label: "Finance", icon: Banknote },
      { href: "/admin/payouts", label: "Payouts", icon: BadgeCheck },
      { href: "/admin/settings", label: "Settings", icon: Settings },
    ],
  },
];

export const ADMIN_NAV_ITEMS: AdminNavItem[] = ADMIN_NAV_GROUPS.flatMap((g) => g.items);

/** Pages that belong to a section without living under its path. */
const SECTION_ALIASES: Record<string, string[]> = {
  "/admin/challenges": ["/admin/quick-matches"],
  "/admin/disputes": ["/admin/matches"],
};

export function isAdminNavActive(pathname: string, href: string): boolean {
  if (href === "/admin") return pathname === "/admin";
  return [href, ...(SECTION_ALIASES[href] ?? [])].some((h) => pathname === h || pathname.startsWith(`${h}/`));
}

/** The section a path belongs to, for the top bar. */
export function adminSectionFor(pathname: string) {
  return ADMIN_NAV_ITEMS.find((item) => isAdminNavActive(pathname, item.href)) ?? null;
}

export function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 hidden h-screen w-16 shrink-0 flex-col border-r border-border bg-background px-2 py-5 sm:flex lg:w-[216px] lg:px-3">
      <Link href="/admin" className="mb-6 flex h-8 items-center justify-center gap-2.5 px-2 lg:justify-start">
        {/* eslint-disable-next-line @next/next/no-img-element -- local /public asset, no next/image usage elsewhere in this codebase */}
        <img src="/circuit-logo.png" alt="Circuit" width={700} height={347} className="h-5 w-auto max-w-none" />
        <span className="hidden rounded-[5px] border border-border-strong px-1.5 py-px text-[10px] font-semibold tracking-[0.08em] text-muted uppercase lg:inline">Admin</span>
      </Link>

      <nav className="flex flex-col gap-5">
        {ADMIN_NAV_GROUPS.map((group) => (
          <div key={group.label} className="flex flex-col gap-px">
            <span className="hidden px-3 pb-1.5 text-[11px] font-medium text-muted-strong lg:block">{group.label}</span>
            {group.items.map((item) => {
              const active = isAdminNavActive(pathname, item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={item.label}
                  aria-current={active ? "page" : undefined}
                  className={`relative flex h-9 items-center justify-center gap-2.5 rounded-[7px] px-3 text-[13px] font-medium transition-colors duration-[var(--duration-fast)] lg:justify-start ${
                    active ? "bg-surface-elevated text-foreground" : "text-muted hover:bg-surface hover:text-foreground"
                  }`}
                >
                  {active && <span aria-hidden className="absolute top-2 bottom-2 left-0 w-[2px] rounded-full bg-accent-volt" />}
                  <Icon size={16} strokeWidth={active ? 2.2 : 1.8} className={active ? "text-foreground" : "text-muted-strong"} />
                  <span className="hidden lg:inline">{item.label}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="mt-auto border-t border-border px-2 pt-3">
        <Link
          href="/"
          title="Back to Circuit"
          className="flex h-8 items-center justify-center gap-2 rounded-[7px] text-[13px] font-medium text-muted transition hover:text-foreground lg:justify-start lg:px-1"
        >
          <span aria-hidden>←</span>
          <span className="hidden lg:inline">Back to Circuit</span>
        </Link>
      </div>
    </aside>
  );
}
