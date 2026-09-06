"use client";

/**
 * Circuit — the one persistent sidebar, replacing the old three-way split
 * (SiteHeader's top nav, BottomTabBar, DashboardNav). Flat primary list +
 * a single "More" disclosure (MoreMenu) for Wallet/Marketplace/Rewards and
 * the Organize/Staff groups — matches the NEXA reference's flat sidebar
 * shape (Home/Play/Tournaments/Profile/.../More) while keeping every
 * existing link reachable, just regrouped behind one toggle instead of
 * always-visible labeled sections. See the NEXA-rebuild plan for why each
 * NEXA sidebar item was kept, renamed, or dropped.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Swords, Trophy, MessageSquare, User as UserIcon, Wallet, ShoppingBag, Gift, Shield } from "lucide-react";
import { MoreMenu, type MoreSection } from "./MoreMenu";
import { SidebarPromoCard } from "./SidebarPromoCard";

type NavUser = { handle: string; isStaff: boolean } | null;

type Item = { href: string; label: string; icon: React.ComponentType<{ size?: number }> };

const PRIMARY: Item[] = [
  { href: "/", label: "Home", icon: Home },
  { href: "/battles", label: "Battles", icon: Swords },
  { href: "/ladder", label: "Ladders", icon: Trophy },
  { href: "/community", label: "Community", icon: MessageSquare },
];

function NavLink({ item, active }: { item: Item; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition ${
        active ? "bg-brand text-white" : "text-muted hover:bg-surface-hover hover:text-foreground"
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

  const moreSections: MoreSection[] = [];
  if (user) {
    moreSections.push({
      items: [
        { href: "/wallet", label: "Wallet", icon: Wallet },
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
    <aside className="sticky top-0 hidden h-screen w-full flex-col gap-6 overflow-y-auto border-r border-border px-3 py-6 sm:flex">
      <Link href="/" className="flex shrink-0 items-center gap-1.5 px-3 text-lg font-bold tracking-tight">
        <span className="h-2 w-2 rounded-full bg-brand" />
        Circuit
      </Link>

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
        {user && <MoreMenu sections={moreSections} pathname={pathname} />}
      </nav>

      <div className="mt-auto flex flex-col gap-3">
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
      </div>
    </aside>
  );
}
