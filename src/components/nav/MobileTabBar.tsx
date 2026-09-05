"use client";

/**
 * Circuit — mobile primary nav (docs/circuit-ui-references.md: start.gg's
 * bottom tab bar pattern, still the right call on mobile). 5 fixed slots:
 * Home/Battles/Create(elevated)/Community/Menu. Everything that doesn't
 * fit (Ladders, My Profile, Wallet/Marketplace/Rewards, Organize, Staff,
 * Account, Log out) lives in the Menu sheet — NEXA's own "More" catch-all
 * concept, relocated to where the real space constraint actually is.
 */

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Home,
  Swords,
  Plus,
  MessageSquare,
  Menu as MenuIcon,
  X,
  Trophy,
  User as UserIcon,
  Wallet,
  ShoppingBag,
  Gift,
  Shield,
} from "lucide-react";

type NavUser = { handle: string; isStaff: boolean } | null;

const DASHBOARD_ITEMS = [
  { href: "/dashboard", label: "Tournaments" },
  { href: "/dashboard/battles", label: "Battles" },
  { href: "/dashboard/disputes", label: "Disputes" },
  { href: "/dashboard/payouts", label: "Payouts" },
];

export function MobileTabBar({ user }: { user: NavUser }) {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const inDashboard = pathname.startsWith("/dashboard");

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setMenuOpen(false);
    router.push("/");
    router.refresh();
  }

  return (
    <>
      {inDashboard && (
        <nav className="fixed inset-x-0 bottom-14 z-10 flex gap-1 overflow-x-auto border-t border-border bg-background/95 px-2 py-1.5 backdrop-blur-md sm:hidden">
          {DASHBOARD_ITEMS.map((item) => {
            const active = item.href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium ${
                  active ? "bg-brand-soft text-brand" : "text-muted"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      )}

      <nav className="fixed inset-x-0 bottom-0 z-10 flex border-t border-border bg-background/95 backdrop-blur-md sm:hidden">
        <Link href="/" className="flex flex-1 flex-col items-center gap-0.5 py-2.5 text-xs text-muted">
          <Home size={18} />
          Home
        </Link>
        <Link href="/battles" className="flex flex-1 flex-col items-center gap-0.5 py-2.5 text-xs text-muted">
          <Swords size={18} />
          Battles
        </Link>
        <Link href={user ? "/tournaments/new" : "/signup"} className="flex flex-1 flex-col items-center gap-0.5 py-1.5 text-xs text-muted">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand text-white shadow-sm shadow-brand/30">
            <Plus size={18} />
          </span>
        </Link>
        <Link href="/community" className="flex flex-1 flex-col items-center gap-0.5 py-2.5 text-xs text-muted">
          <MessageSquare size={18} />
          Community
        </Link>
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          className="flex flex-1 flex-col items-center gap-0.5 py-2.5 text-xs text-muted"
        >
          <MenuIcon size={18} />
          Menu
        </button>
      </nav>

      {menuOpen && (
        <div className="fixed inset-0 z-30 flex items-end sm:hidden" onClick={() => setMenuOpen(false)}>
          <div className="absolute inset-0 bg-black/60" />
          <div
            className="relative z-10 flex max-h-[70vh] w-full flex-col gap-1 overflow-y-auto rounded-t-2xl border-t border-border bg-surface p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-semibold">Menu</span>
              <button type="button" onClick={() => setMenuOpen(false)} aria-label="Close">
                <X size={20} className="text-muted" />
              </button>
            </div>

            <Link href="/ladder" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm">
              <Trophy size={18} /> Ladders
            </Link>
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
              <>
                <Link href="/wallet" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm">
                  <Wallet size={18} /> Wallet
                </Link>
                <Link href="/marketplace" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm">
                  <ShoppingBag size={18} /> Marketplace
                </Link>
                <Link href="/rewards" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm">
                  <Gift size={18} /> Rewards
                </Link>
                <span className="mt-2 px-3 text-xs font-bold tracking-wide text-muted uppercase">Organize</span>
                {DASHBOARD_ITEMS.map((item) => (
                  <Link key={item.href} href={item.href} onClick={() => setMenuOpen(false)} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm">
                    <Shield size={18} /> {item.label}
                  </Link>
                ))}
                {user.isStaff && (
                  <>
                    <span className="mt-2 px-3 text-xs font-bold tracking-wide text-muted uppercase">Staff</span>
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
