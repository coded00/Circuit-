"use client";

/**
 * Circuit — left navigation. Primary list matches the MVP rework spec's
 * exact desktop nav (section 10): Home, Compete, Games, Challenges,
 * Wallet, Profile — plus "Calendar" (added post-MVP, real Tournament/
 * Battle data browsable by date; see /calendar's own header comment) —
 * 180px at desktop, deliberately wider than the spec's own 170px figure
 * per explicit request. Notifications live only in the top header (no
 * "Messages" item here), per the same spec section.
 *
 * Watch/Live/Community are removed-from-MVP (spec section 4) — hidden
 * from navigation, not deleted; their routes/components stay on disk.
 * "Compete" and "Games" are Circuit's real tournament-discovery
 * (`/compete`) and per-game ladder (`/ladder`) pages; "Challenges" is the
 * existing free 1v1 Battle feature under its new user-facing name — same
 * `/battles` route, no schema/logic change, copy-only rename.
 *
 * No "More" disclosure: that used to fold Marketplace/Rewards/Organize/
 * Staff behind one toggle at the bottom of this same flat list — expanded
 * (which it does automatically on any of those pages), it pushed the
 * rail's total height past the viewport and forced it to scroll
 * internally. Every one of those links still exists; they just live in
 * the account dropdown in the top bar now (`AccountMenu.tsx`) instead of
 * competing for space in the primary rail, so this fixed 7-row list
 * always fits `h-screen` without scrolling.
 *
 * Elevated pass: the rail itself now sits on the app's dark surface
 * scope (`data-surface="dark"`, same mechanism `CircuitHero`/
 * `SidebarPromoCard` already use) rather than the light page background,
 * with a solid-filled Volt pill for the active item — every class here
 * still references theme tokens (`bg-surface`, `text-muted`, etc.), so
 * this scope flip re-themes the whole rail automatically.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Trophy, Gamepad2, Swords, Calendar, User as UserIcon, Wallet, Settings } from "lucide-react";
import { SidebarPromoCard } from "./SidebarPromoCard";

type NavUser = { handle: string; displayName: string; isStaff: boolean } | null;

type Item = { href: string; label: string; icon: React.ComponentType<{ size?: number; className?: string }> };

const PRIMARY: Item[] = [
  { href: "/", label: "Home", icon: Home },
  { href: "/compete", label: "Compete", icon: Trophy },
  { href: "/ladder", label: "Games", icon: Gamepad2 },
  { href: "/battles", label: "Challenges", icon: Swords },
  { href: "/calendar", label: "Calendar", icon: Calendar },
];

function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

/** Row height (46px) + the nav's own gap-1 (4px) — the sliding indicator
 *  below is positioned by plain index arithmetic against this, not a
 *  measured DOM rect, since every row in this list is this exact height. */
const NAV_ROW_STEP = 50;

function NavLink({ item, active, badge }: { item: Item; active: boolean; badge?: number }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      title={item.label}
      className={`relative z-10 flex h-[46px] items-center justify-center gap-3 rounded-[9px] px-2 text-sm font-semibold transition-colors duration-[var(--duration-fast)] lg:justify-start lg:px-4 ${
        active ? "text-accent-volt-foreground" : "text-muted hover:bg-surface-elevated hover:text-foreground"
      }`}
    >
      <Icon size={18} className={active ? "text-accent-volt-foreground" : undefined} />
      <span className="hidden lg:inline">{item.label}</span>
      {!!badge && badge > 0 && (
        <>
          {/* Tablet (icon-only): a small dot on the icon itself. Desktop
              (labeled): the full count pill at the end of the row. */}
          <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-live lg:hidden" aria-hidden />
          <span className="hidden lg:ml-auto lg:flex lg:h-4 lg:min-w-4 lg:items-center lg:justify-center lg:rounded-full lg:bg-live lg:px-1 lg:font-mono lg:text-[10px] lg:font-semibold lg:text-white">
            {badge > 9 ? "9+" : badge}
          </span>
        </>
      )}
    </Link>
  );
}

export function AppSidebar({ user }: { user: NavUser }) {
  const pathname = usePathname();

  const items: Item[] = [
    ...PRIMARY,
    ...(user ? [{ href: "/wallet", label: "Wallet", icon: Wallet }] : []),
    ...(user ? [{ href: `/players/${user.handle}`, label: "Profile", icon: UserIcon }] : []),
  ];
  const activeIndex = items.findIndex((item) => isActive(pathname, item.href));

  return (
    <aside
      data-surface="dark"
      className="sticky top-0 hidden h-screen w-full flex-col gap-1 overflow-y-auto border-r border-border bg-background px-2 py-6 text-foreground sm:flex lg:px-3"
    >
      <Link href="/" title="Circuit" className="mb-6 flex shrink-0 items-center justify-center px-2 lg:justify-start">
        {/* eslint-disable-next-line @next/next/no-img-element -- local /public asset, no next/image usage elsewhere in this codebase */}
        <img src="/circuit-logo.png" alt="Circuit" width={700} height={347} className="h-5 w-auto max-w-none lg:h-14" />
      </Link>

      <nav className="relative flex flex-col gap-1">
        {activeIndex !== -1 && (
          <span
            aria-hidden
            className="absolute inset-x-0 z-0 h-[46px] rounded-[9px] bg-accent-volt transition-transform duration-[var(--duration-base)] ease-[var(--ease-out)]"
            style={{ transform: `translateY(${activeIndex * NAV_ROW_STEP}px)` }}
          />
        )}
        {items.map((item, i) => (
          <NavLink key={item.href} item={item} active={i === activeIndex} />
        ))}
      </nav>

      {/* Phase 16 (tablet): the promo card and its own login/signup pair
          need real label text to make sense at all, so both wait for the
          full lg+ rail — a guest at tablet width still has Log in/Sign up
          available in the top bar, so nothing is actually unreachable. */}
      <div className="mt-auto hidden flex-col gap-3 pt-4 lg:flex">
        <SidebarPromoCard />
        {!user && (
          <div className="flex flex-col gap-2">
            <Link href="/login" className="btn-secondary w-full">
              Log in
            </Link>
            <Link href="/signup" className="btn-primary w-full">
              Sign up
            </Link>
          </div>
        )}
        {user ? (
          <div className="flex items-center gap-2 border-t border-border px-1 pt-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-elevated text-xs font-semibold text-muted">
              {user.displayName.slice(0, 1).toUpperCase()}
            </span>
            <div className="flex min-w-0 flex-1 flex-col leading-tight">
              <span className="truncate text-xs font-medium text-foreground">{user.displayName}</span>
              <span className="truncate text-[10px] text-muted">@{user.handle}</span>
            </div>
            <Link
              href="/account"
              aria-label="Account settings"
              title="Account settings"
              className="shrink-0 text-muted transition hover:text-foreground"
            >
              <Settings size={15} aria-hidden="true" />
            </Link>
          </div>
        ) : (
          <p className="px-1 text-[10px] leading-snug text-muted-strong">
            © 2026 CIRCUIT
            <br />
            Play Connected.
          </p>
        )}
      </div>
    </aside>
  );
}
