"use client";

/**
 * Circuit — left navigation. Primary list matches the MVP rework spec's
 * exact desktop nav (section 10): Home, Compete, Games, Challenges,
 * Wallet, Profile — 180px at desktop, deliberately wider than the spec's
 * own 170px figure per explicit request. Notifications live only in the
 * top header (no "Messages" item here), per the same spec section.
 *
 * Watch/Live/Community are removed-from-MVP (spec section 4) — hidden
 * from navigation, not deleted; their routes/components stay on disk.
 * "Compete" and "Games" are Circuit's real tournament-discovery
 * (`/compete`) and per-game ladder (`/ladder`) pages; "Challenges" is the
 * existing free 1v1 Battle feature under its new user-facing name — same
 * `/battles` route, no schema/logic change, copy-only rename.
 *
 * Active-state styling follows the spec directly: a Volt icon, dark
 * (unchanged) text, and a very subtle Volt-tinted background — no filled
 * pill, no glow.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  Trophy,
  Gamepad2,
  Swords,
  User as UserIcon,
  Wallet,
  ShoppingBag,
  Gift,
  Shield,
  MoreHorizontal,
} from "lucide-react";
import { MoreMenu, type MoreSection } from "./MoreMenu";
import { SidebarPromoCard } from "./SidebarPromoCard";

type NavUser = { handle: string; isStaff: boolean } | null;

type Item = { href: string; label: string; icon: React.ComponentType<{ size?: number; className?: string }> };

const PRIMARY: Item[] = [
  { href: "/", label: "Home", icon: Home },
  { href: "/compete", label: "Compete", icon: Trophy },
  { href: "/ladder", label: "Games", icon: Gamepad2 },
  { href: "/battles", label: "Challenges", icon: Swords },
];

function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

function NavLink({ item, active, badge }: { item: Item; active: boolean; badge?: number }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      title={item.label}
      className={`relative flex h-[46px] items-center justify-center gap-3 rounded-[9px] px-2 text-sm font-medium transition lg:justify-start lg:px-4 ${
        active ? "bg-accent-volt-soft text-foreground" : "text-muted hover:bg-surface-elevated hover:text-foreground"
      }`}
    >
      <Icon size={18} className={active ? "text-accent-volt" : undefined} />
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

export function AppSidebar({
  user,
  disputeCount,
}: {
  user: NavUser;
  disputeCount: number;
}) {
  const pathname = usePathname();

  const moreSections: MoreSection[] = [];
  if (user) {
    moreSections.push({
      items: [
        { href: "/marketplace", label: "Marketplace", icon: ShoppingBag },
        { href: "/rewards", label: "Rewards", icon: Gift },
      ],
    });
    moreSections.push({
      label: "Organize",
      items: [
        { href: "/dashboard", label: "Tournaments", icon: Trophy },
        { href: "/dashboard/battles", label: "Battles queue", icon: Swords },
        { href: "/dashboard/disputes", label: "Disputes", icon: Shield, badge: disputeCount },
        { href: "/dashboard/payouts", label: "Payouts", icon: Wallet },
      ],
    });
    if (user.isStaff) {
      moreSections.push({
        label: "Staff",
        items: [
          { href: "/staff/disputes", label: "Disputes queue", icon: Shield },
          { href: "/staff/reports", label: "Reports", icon: Shield },
        ],
      });
    }
  }

  return (
    <aside
      className="sticky top-0 hidden h-screen w-full flex-col gap-1 overflow-y-auto border-r px-2 py-6 sm:flex lg:px-3"
      style={{ background: "var(--sidebar-bg)", borderColor: "var(--border)" }}
    >
      <Link
        href="/"
        title="Circuit"
        className="mb-6 flex shrink-0 items-center justify-center gap-1.5 px-2 font-display text-xl font-bold tracking-wide lg:justify-start"
      >
        <span className="h-2 w-2 shrink-0 rounded-full bg-accent-volt" />
        <span className="hidden lg:inline">CIRCUIT</span>
      </Link>

      <nav className="flex flex-col gap-1">
        {PRIMARY.map((item) => (
          <NavLink key={item.href} item={item} active={isActive(pathname, item.href)} />
        ))}
        {user && <NavLink item={{ href: "/wallet", label: "Wallet", icon: Wallet }} active={isActive(pathname, "/wallet")} />}
        {user && (
          <NavLink
            item={{ href: `/players/${user.handle}`, label: "Profile", icon: UserIcon }}
            active={isActive(pathname, `/players/${user.handle}`)}
          />
        )}
        {user && (
          <div className="mt-1">
            <MoreMenu sections={moreSections} pathname={pathname} />
          </div>
        )}
        {!user && (
          <div
            title="More"
            className="flex h-[46px] items-center justify-center gap-3 rounded-[9px] px-2 text-sm font-medium text-muted lg:justify-start lg:px-4"
          >
            <MoreHorizontal size={18} />
            <span className="hidden lg:inline">More</span>
          </div>
        )}
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
        <p className="px-1 text-[10px] leading-snug text-muted-strong">
          © 2026 CIRCUIT
          <br />
          Play Connected.
        </p>
      </div>
    </aside>
  );
}
