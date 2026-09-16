"use client";

/**
 * Circuit — mobile primary nav. 5 fixed slots matching the MVP rework
 * spec's mobile set exactly: Home / Compete / Challenges / Wallet /
 * Profile (spec section 44) — Watch/Live are removed-from-MVP and no
 * longer appear here at all (hidden, not deleted — see /watch's own
 * route, still on disk).
 *
 * Games/Calendar/Marketplace/Rewards/Organize/Staff/Account (everything
 * that doesn't fit the primary 5) live in the sheet opened from the
 * Profile tab — same pattern the desktop sidebar's "More" disclosure
 * uses for its own overflow.
 *
 * Active-state color follows the shared "Volt icon, [dark] text" nav
 * convention (see AppSidebar.tsx) rather than coloring the label text
 * volt — volt fails contrast at this text size.
 */

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Home,
  Trophy,
  Swords,
  Wallet,
  Gamepad2,
  Calendar,
  X,
  User as UserIcon,
  Bell,
  ShoppingBag,
  Gift,
  Shield,
  Compass,
  Plus,
} from "lucide-react";

type NavUser = { handle: string; isStaff: boolean } | null;

const DASHBOARD_ITEMS = [
  { href: "/dashboard", label: "Tournaments", icon: Trophy },
  { href: "/dashboard/battles", label: "Battles queue", icon: Swords },
  { href: "/dashboard/disputes", label: "Disputes", icon: Shield },
  { href: "/dashboard/payouts", label: "Payouts", icon: Wallet },
];

function TabLink({
  href,
  icon: Icon,
  label,
  active,
}: {
  href: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-xs transition-colors duration-[var(--duration-fast)] ${active ? "text-foreground" : "text-muted"}`}
    >
      <Icon size={18} className={active ? "text-accent-volt" : undefined} />
      {label}
    </Link>
  );
}

export function MobileTabBar({ user }: { user: NavUser }) {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const inDashboard = pathname.startsWith("/dashboard");
  const onProfile = user ? pathname.startsWith(`/players/${user.handle}`) : false;

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setMenuOpen(false);
    router.push("/");
    router.refresh();
  }

  return (
    <>
      {inDashboard && (
        <nav className="fixed inset-x-0 bottom-[calc(3.5rem_+_env(safe-area-inset-bottom))] z-10 flex gap-1 overflow-x-auto border-t border-border bg-background/95 px-2 py-1.5 backdrop-blur-md sm:hidden">
          {DASHBOARD_ITEMS.map((item) => {
            const active = item.href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors duration-[var(--duration-fast)] ${active ? "bg-accent-volt-soft text-foreground" : "text-muted"}`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      )}

      <nav className="fixed inset-x-0 bottom-0 z-10 flex border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md sm:hidden">
        <TabLink href="/" icon={Home} label="Home" active={pathname === "/"} />
        <TabLink href="/compete" icon={Trophy} label="Compete" active={pathname.startsWith("/compete")} />
        <TabLink href="/battles" icon={Swords} label="Challenges" active={pathname.startsWith("/battles")} />
        <TabLink href="/wallet" icon={Wallet} label="Wallet" active={pathname.startsWith("/wallet")} />
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-xs transition-colors duration-[var(--duration-fast)] ${onProfile ? "text-foreground" : "text-muted"}`}
        >
          <UserIcon size={18} className={onProfile ? "text-accent-volt" : undefined} />
          Profile
        </button>
      </nav>

      {menuOpen && (
        <div className="fixed inset-0 z-30 flex items-end sm:hidden" onClick={() => setMenuOpen(false)}>
          <div className="sheet-backdrop-enter absolute inset-0 bg-black/60" />
          <div
            className="sheet-panel-enter relative z-10 flex max-h-[75vh] w-full flex-col gap-1 overflow-y-auto rounded-t-2xl border-t border-border bg-surface p-4 pb-[calc(1rem_+_env(safe-area-inset-bottom))]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-semibold">Menu</span>
              <button type="button" onClick={() => setMenuOpen(false)} aria-label="Close">
                <X size={20} className="text-muted" />
              </button>
            </div>

            {user && (
              <Link
                href={`/players/${user.handle}`}
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm"
              >
                <UserIcon size={18} /> My Profile
              </Link>
            )}
            {user && (
              <Link href="/discover" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm">
                <Compass size={18} /> Discover
              </Link>
            )}
            {user && (
              <>
                <span className="text-eyebrow mt-2 px-3">Create</span>
                <Link href="/tournaments/new" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm">
                  <Plus size={18} /> New tournament
                </Link>
                <Link href="/battles/new" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm">
                  <Swords size={18} /> Open a Battle
                </Link>
              </>
            )}
            <Link href="/ladder" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm">
              <Gamepad2 size={18} /> Games
            </Link>
            <Link href="/calendar" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm">
              <Calendar size={18} /> Calendar
            </Link>
            {user && (
              <>
                <Link href="/notifications" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm">
                  <Bell size={18} /> Messages
                </Link>
                <Link href="/marketplace" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm">
                  <ShoppingBag size={18} /> Marketplace
                </Link>
                <Link href="/rewards" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm">
                  <Gift size={18} /> Rewards
                </Link>
                <span className="text-eyebrow mt-2 px-3">Organize</span>
                {DASHBOARD_ITEMS.map((item) => (
                  <Link key={item.href} href={item.href} onClick={() => setMenuOpen(false)} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm">
                    <item.icon size={18} /> {item.label}
                  </Link>
                ))}
                {user.isStaff && (
                  <>
                    <span className="text-eyebrow mt-2 px-3">Staff</span>
                    <Link href="/staff/disputes" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm">
                      <Shield size={18} /> Disputes queue
                    </Link>
                    <Link href="/staff/reports" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm">
                      <Shield size={18} /> Reports
                    </Link>
                  </>
                )}
                <span className="mt-2 border-t border-border pt-2" />
                <Link href="/account" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm">
                  Account settings
                </Link>
                <button type="button" onClick={handleLogout} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-danger">
                  Log out
                </button>
              </>
            )}
            {!user && (
              <>
                <Link href="/login" onClick={() => setMenuOpen(false)} className="btn-secondary mt-2 w-full">
                  Log in
                </Link>
                <Link href="/signup" onClick={() => setMenuOpen(false)} className="btn-primary w-full">
                  Sign up
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
