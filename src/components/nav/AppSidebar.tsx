"use client";

/**
 * Circuit — the one persistent sidebar, replacing the old three-way split
 * (SiteHeader's top nav, BottomTabBar, DashboardNav). Sectioned, not
 * tab-switched: Primary (everyone), Footer (Wallet/Marketplace/Rewards,
 * logged in), Organize (the old dashboard nav, logged in), Staff
 * (isStaff only). See the NEXA-rebuild plan for why each NEXA sidebar
 * item was kept, renamed, or dropped.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Swords, Trophy, MessageSquare, User as UserIcon, Wallet, ShoppingBag, Gift, Shield } from "lucide-react";

type NavUser = { handle: string; isStaff: boolean } | null;

type Item = { href: string; label: string; icon: React.ComponentType<{ size?: number }> };

const PRIMARY: Item[] = [
  { href: "/", label: "Home", icon: Home },
  { href: "/battles", label: "Battles", icon: Swords },
  { href: "/ladder", label: "Ladders", icon: Trophy },
  { href: "/community", label: "Community", icon: MessageSquare },
];

const FOOTER: Item[] = [
  { href: "/wallet", label: "Wallet", icon: Wallet },
  { href: "/marketplace", label: "Marketplace", icon: ShoppingBag },
  { href: "/rewards", label: "Rewards", icon: Gift },
];

const ORGANIZE: (Item & { badge?: number })[] = [
  { href: "/dashboard", label: "Tournaments", icon: Trophy },
  { href: "/dashboard/battles", label: "Battles queue", icon: Swords },
  { href: "/dashboard/disputes", label: "Disputes", icon: Shield },
  { href: "/dashboard/payouts", label: "Payouts", icon: Wallet },
];

const STAFF: Item[] = [
  { href: "/staff/disputes", label: "Disputes queue", icon: Shield },
  { href: "/staff/reports", label: "Reports", icon: Shield },
];

function NavLink({ item, active }: { item: Item; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition ${
        active ? "bg-brand-soft text-brand" : "text-muted hover:bg-surface-hover hover:text-foreground"
      }`}
    >
      <Icon size={17} />
      {item.label}
    </Link>
  );
}

function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export function AppSidebar({ user, disputeCount }: { user: NavUser; disputeCount: number }) {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 hidden h-screen w-full flex-col gap-6 overflow-y-auto border-r border-border px-3 py-6 sm:flex">
      <nav className="flex flex-col gap-1">
        {PRIMARY.map((item) => (
          <NavLink key={item.href} item={item} active={isActive(pathname, item.href)} />
        ))}
        {user && (
          <NavLink
            item={{ href: `/players/${user.handle}`, label: "My Profile", icon: UserIcon }}
            active={isActive(pathname, `/players/${user.handle}`)}
          />
        )}
      </nav>

      {user && (
        <nav className="flex flex-col gap-1">
          {FOOTER.map((item) => (
            <NavLink key={item.href} item={item} active={isActive(pathname, item.href)} />
          ))}
        </nav>
      )}

      {user && (
        <div className="flex flex-col gap-1">
          <span className="px-3 text-xs font-bold tracking-wide text-muted uppercase">Organize</span>
          {ORGANIZE.map((item) => (
            <div key={item.href} className="relative">
              <NavLink item={item} active={isActive(pathname, item.href)} />
              {item.href === "/dashboard/disputes" && disputeCount > 0 && (
                <span className="absolute top-1.5 right-2.5 rounded-full bg-status-cancelled/15 px-1.5 py-0.5 font-mono text-xs font-semibold tabular-nums text-status-cancelled">
                  {disputeCount}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {user?.isStaff && (
        <div className="flex flex-col gap-1">
          <span className="px-3 text-xs font-bold tracking-wide text-muted uppercase">Staff</span>
          {STAFF.map((item) => (
            <NavLink key={item.href} item={item} active={isActive(pathname, item.href)} />
          ))}
        </div>
      )}

      {!user && (
        <div className="mt-auto flex flex-col gap-2 pt-4">
          <Link href="/login" className="btn-secondary w-full">
            Log in
          </Link>
          <Link href="/signup" className="btn-primary w-full">
            Sign up
          </Link>
        </div>
      )}
    </aside>
  );
}
