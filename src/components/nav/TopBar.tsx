import Link from "next/link";
import type { User } from "@prisma/client";
import { prisma } from "@/lib/db";
import { SearchInput } from "@/components/SearchInput";
import { NotificationBell } from "@/components/NotificationBell";
import { CreateMenu } from "./CreateMenu";
import { AccountMenu } from "./AccountMenu";
import { MobileSearchToggle } from "./MobileSearchToggle";
import { WalletBalanceChip } from "./WalletBalanceChip";
import { GuestAuthLink } from "./GuestAuthLink";

/**
 * Circuit — top header. ~60px, integrated into the page rather than a
 * separate thick bar.
 *
 * Fixed, not sticky: `position: sticky` never actually overlaps page
 * content — the sticky element keeps its own reserved space in the
 * document flow, so content is pushed down and stops flush below it
 * rather than ever scrolling underneath. That made the header's
 * translucent/blurred background pointless (there was never anything
 * behind it to blur). `fixed` removes the header from flow entirely, so
 * scrolled content genuinely passes behind the blur — `<main>` in
 * layout.tsx carries matching top padding so nothing starts out hidden
 * under it.
 *
 * The outer `<header>` is a bare positioning shell (fixed, full width, no
 * paint of its own) — the actual visible bar (background/blur/border) is
 * the grid child one level in, confined to the same second (`1fr`) column
 * AppShell's own grid gives the main content. That's deliberate, not
 * redundant nesting: painting the bar on the outer element instead (full
 * `inset-x-0`) would size it to the whole viewport, and since this header
 * is `z-30` while AppShell's grid is a plain unpositioned `<div>`, that
 * bar would then render on top of the sidebar's own top edge at `sm`+
 * instead of stopping where the sidebar ends. Confining paint to the
 * grid-positioned child fixes that, and — because it's the same
 * `mx-auto max-w-[1920px]` grid AppShell itself uses — also keeps the bar
 * aligned with the sidebar/main column once the viewport exceeds 1920px
 * and that column starts centering with side margins instead of touching
 * the true screen edge.
 *
 * Look: the header shares the sidebar's dark surface, so the app reads as
 * one dark frame around the light page. Left: search. Right: one HUD
 * strip — wallet · alerts · Create · you — every control the same size and
 * separated by hairlines, instead of a row of unrelated widgets.
 *
 * Create is desktop/tablet-only (`hidden sm:block`) — at 320–375px the
 * phone header holds logo, search toggle, wallet, notifications and
 * account, and Create doesn't fit beside them. "New tournament"/"Open a Battle"
 * move into MobileTabBar's own sheet below `sm` instead, the same place
 * Marketplace/Rewards/Organize already live for the same reason.
 */
/** One segment of the HUD strip — shared sizing so every control matches. */
const HUD_BUTTON =
  "flex h-9 w-9 items-center justify-center cut-avatar text-white/70 transition hover:bg-white/[0.07] hover:text-white";

function HudDivider() {
  return <span aria-hidden className="mx-0.5 h-5 w-px shrink-0 bg-white/[0.08]" />;
}

export async function TopBar({ user, disputeCount = 0 }: { user: User | null; disputeCount?: number }) {
  const [unreadCount, friendRequestCount] = await Promise.all([
    user ? prisma.notification.count({ where: { userId: user.id, readAt: null } }) : 0,
    user ? prisma.friendship.count({ where: { addresseeId: user.id, accepted: false } }) : 0,
  ]);

  return (
    // Named so page view transitions leave it pinned (globals.css).
    <header className="fixed inset-x-0 top-0 z-30 h-[60px]" style={{ viewTransitionName: "site-header" }}>
      {/* A single grid child placed into the second (`1fr`) column at
          sm+ — no empty first-column spacer div needed, which would
          otherwise force a second implicit row (and unwanted extra
          height) once `grid-cols-1` collapses to one column on mobile. */}
      <div className="mx-auto grid h-full w-full max-w-[1920px] grid-cols-1 sm:grid-cols-[var(--sidebar-width-sm)_1fr] lg:grid-cols-[var(--sidebar-width-lg)_1fr]">
        {/* Same dark surface as the sidebar, so the two read as one frame
            around the page rather than two unrelated bars. */}
        <div
          data-surface="dark"
          className="col-start-1 flex h-full items-center gap-2 border-b border-white/[0.06] bg-background px-3 sm:col-start-2 sm:gap-5 sm:px-6 lg:px-8"
        >
          <Link href="/" className="flex shrink-0 items-center sm:hidden" aria-label="Circuit home">
            {/* eslint-disable-next-line @next/next/no-img-element -- local /public asset, no next/image usage elsewhere in this codebase */}
            <img src="/circuit-logo.png" alt="Circuit" width={700} height={347} className="h-9 w-auto max-w-none" />
          </Link>

          <SearchInput className="hidden min-w-0 flex-1 sm:block sm:max-w-[340px] xl:max-w-[460px]" />

          <div className="ml-auto flex shrink-0 items-center gap-2">
            <MobileSearchToggle />
            {/* The signed-in strip has no clip-path: the notification, create and account menus open out of it, and a cut corner would clip them. */}
            {user ? (
              <div className="flex items-center border border-white/[0.08] bg-white/[0.03] p-1">
                <WalletBalanceChip balance={user.walletBalance} />
                <HudDivider />
                <NotificationBell initialUnreadCount={unreadCount} buttonClassName={HUD_BUTTON} />
                <div className="hidden items-center sm:flex">
                  <HudDivider />
                  <CreateMenu />
                </div>
                <HudDivider />
                <AccountMenu
                  user={{
                    handle: user.handle,
                    displayName: user.displayName,
                    avatarUrl: user.avatarUrl,
                    isStaff: user.isStaff,
                  }}
                  disputeCount={disputeCount}
                  friendRequestCount={friendRequestCount}
                />
              </div>
            ) : (
              <div className="flex items-center gap-1 cut-sm [--cut-line:rgb(255_255_255/0.08)] border border-white/[0.08] bg-white/[0.03] p-1">
                <GuestAuthLink mode="login" className="rounded-none px-3 py-2 text-sm font-semibold text-white/80 transition hover:bg-white/[0.07] hover:text-white">
                  Log in
                </GuestAuthLink>
                <GuestAuthLink
                  mode="signup"
                  className="flex h-9 items-center rounded-none bg-accent-volt px-3.5 text-sm font-semibold text-accent-volt-foreground transition hover:brightness-95"
                >
                  Sign up
                </GuestAuthLink>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
