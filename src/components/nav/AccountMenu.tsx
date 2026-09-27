"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, ShoppingBag, Gift, Trophy, Swords, Shield, Wallet, Compass } from "lucide-react";

type NavUser = { handle: string; displayName: string; avatarUrl: string | null; isStaff: boolean };

function MenuLink({
  href,
  icon: Icon,
  children,
  badge,
  onClick,
}: {
  href: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  children: React.ReactNode;
  badge?: number;
  onClick: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className="flex items-center gap-2.5 px-4 py-2 text-sm hover:bg-surface-elevated"
    >
      <Icon size={15} className="shrink-0 text-muted" />
      <span className="flex-1">{children}</span>
      {!!badge && badge > 0 && <span className="badge badge-cancelled">{badge > 9 ? "9+" : badge}</span>}
    </Link>
  );
}

/**
 * Circuit — account dropdown. Also home to everything that used to live
 * behind the sidebar's "More" disclosure (Marketplace/Rewards/Organize/
 * Staff — see AppSidebar.tsx's own comment on why that was removed):
 * real destinations, not new ones, just relocated so the primary rail
 * stays a fixed, always-fits-without-scrolling list.
 */
export function AccountMenu({
  user,
  disputeCount = 0,
  friendRequestCount = 0,
}: {
  user: NavUser;
  disputeCount?: number;
  friendRequestCount?: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={`Account menu for ${user.displayName}`}
        aria-expanded={open}
        className="flex items-center gap-2.5 rounded-[12px] p-1 transition hover:bg-surface-elevated lg:pr-2.5"
      >
        {user.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- external, unpredictable-host avatar URLs
          <img src={user.avatarUrl} alt="" referrerPolicy="no-referrer" className="h-9 w-9 rounded-[10px] object-cover" />
        ) : (
          <div className="font-display flex h-9 w-9 items-center justify-center rounded-[10px] bg-[#111318] text-sm font-bold text-accent-volt dark:bg-accent-volt-soft">
            {user.displayName.slice(0, 1).toUpperCase()}
          </div>
        )}
        {/* Real identity only — the old decorative "Level 24" wasn't data. */}
        <span className="hidden flex-col items-start lg:flex">
          <span className="max-w-28 truncate text-sm leading-tight font-semibold">{user.displayName}</span>
          <span className="max-w-28 truncate font-mono text-[11px] leading-tight text-muted-strong">@{user.handle}</span>
        </span>
        <ChevronDown size={14} className="hidden text-muted lg:block" />
      </button>

      {open && (
        <div className="absolute right-0 z-20 mt-2 w-56 dropdown-panel py-1">
          <Link
            href={`/players/${user.handle}?tab=friends`}
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-4 py-2 text-sm hover:bg-surface-elevated"
          >
            <span className="flex-1">My Profile</span>
            {/* Friends/Teams management moved onto the profile's own tabs
                (see players/[handle]/page.tsx) — this badge is the one
                remaining visible cue that something needs your attention
                there, same real count /friends used to show directly. */}
            {friendRequestCount > 0 && <span className="badge badge-cancelled">{friendRequestCount > 9 ? "9+" : friendRequestCount}</span>}
          </Link>
          <Link href="/account" onClick={() => setOpen(false)} className="block px-4 py-2 text-sm hover:bg-surface-elevated">
            Account settings
          </Link>

          <div className="my-1 border-t border-border" />
          <MenuLink href="/discover" icon={Compass} onClick={() => setOpen(false)}>
            Discover
          </MenuLink>

          <div className="my-1 border-t border-border" />
          <MenuLink href="/marketplace" icon={ShoppingBag} onClick={() => setOpen(false)}>
            Marketplace
          </MenuLink>
          <MenuLink href="/rewards" icon={Gift} onClick={() => setOpen(false)}>
            Rewards
          </MenuLink>

          <div className="my-1 border-t border-border" />
          <span className="text-eyebrow block px-4 py-1">Organize</span>
          <MenuLink href="/dashboard" icon={Trophy} onClick={() => setOpen(false)}>
            Tournaments
          </MenuLink>
          <MenuLink href="/dashboard/battles" icon={Swords} onClick={() => setOpen(false)}>
            Battles queue
          </MenuLink>
          <MenuLink href="/dashboard/disputes" icon={Shield} badge={disputeCount} onClick={() => setOpen(false)}>
            Disputes
          </MenuLink>
          <MenuLink href="/dashboard/payouts" icon={Wallet} onClick={() => setOpen(false)}>
            Payouts
          </MenuLink>

          {user.isStaff && (
            <>
              <div className="my-1 border-t border-border" />
              <span className="text-eyebrow block px-4 py-1">Staff</span>
              <MenuLink href="/staff/disputes" icon={Shield} onClick={() => setOpen(false)}>
                Disputes queue
              </MenuLink>
              <MenuLink href="/staff/reports" icon={Shield} onClick={() => setOpen(false)}>
                Reports
              </MenuLink>
            </>
          )}

          <div className="my-1 border-t border-border" />
          <button
            type="button"
            onClick={handleLogout}
            className="block w-full px-4 py-2 text-left text-sm text-danger hover:bg-surface-elevated"
          >
            Log out
          </button>
        </div>
      )}
    </div>
  );
}
