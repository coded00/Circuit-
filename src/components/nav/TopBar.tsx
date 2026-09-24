import Link from "next/link";
import type { User } from "@prisma/client";
import { prisma } from "@/lib/db";
import { SearchInput } from "@/components/SearchInput";
import { NotificationBell } from "@/components/NotificationBell";
import { CreateMenu } from "./CreateMenu";
import { AccountMenu } from "./AccountMenu";
import { MobileSearchToggle } from "./MobileSearchToggle";
import { WalletBalanceChip } from "./WalletBalanceChip";
import { ThemeToggle } from "@/components/ThemeToggle";

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
 * Header actions: Notifications, Create, Profile — "Go Live" was removed
 * (Watch/Live/streaming are out of MVP scope for this rework; the button
 * is gone, `.btn-golive`'s two remaining disabled usages elsewhere are
 * being retired in the same pass).
 *
 * Create is desktop/tablet-only (`hidden sm:block`) — logo + search-toggle
 * + notifications + create + account genuinely don't fit next to each
 * other at 320–375px (measured: they overflow the header by ~70px even
 * with every icon at its minimum size). "New tournament"/"Open a Battle"
 * move into MobileTabBar's own sheet below `sm` instead, the same place
 * Marketplace/Rewards/Organize already live for the same reason.
 */
export async function TopBar({ user, disputeCount = 0 }: { user: User | null; disputeCount?: number }) {
  const [unreadCount, friendRequestCount] = user
    ? await Promise.all([
        prisma.notification.count({ where: { userId: user.id, readAt: null } }),
        prisma.friendship.count({ where: { addresseeId: user.id, accepted: false } }),
      ])
    : [0, 0];

  return (
    <header className="fixed inset-x-0 top-0 z-30 h-[60px]">
      {/* A single grid child placed into the second (`1fr`) column at
          sm+ — no empty first-column spacer div needed, which would
          otherwise force a second implicit row (and unwanted extra
          height) once `grid-cols-1` collapses to one column on mobile. */}
      <div className="mx-auto grid h-full w-full max-w-[1920px] grid-cols-1 sm:grid-cols-[var(--sidebar-width-sm)_1fr] lg:grid-cols-[var(--sidebar-width-lg)_1fr]">
        <div className="col-start-1 flex h-full items-center gap-4 border-b border-border bg-background/85 px-5 backdrop-blur-md sm:col-start-2 sm:px-8">
          <Link href="/" className="flex shrink-0 items-center sm:hidden">
            {/* eslint-disable-next-line @next/next/no-img-element -- local /public asset, no next/image usage elsewhere in this codebase */}
            <img src="/circuit-logo.png" alt="Circuit" width={700} height={347} className="h-12 w-auto max-w-none" />
          </Link>

          <SearchInput className="hidden min-w-0 flex-1 sm:block sm:max-w-[430px]" />

          <div className="ml-auto flex shrink-0 items-center gap-3">
            <MobileSearchToggle />
            {/* sm+ only, same reason as Create below — the phone header is
                already full; phones get it in MobileTabBar's sheet. */}
            <div className="hidden sm:block">
              <ThemeToggle />
            </div>
            {user ? (
              <>
                <WalletBalanceChip balance={user.walletBalance} />
                <NotificationBell initialUnreadCount={unreadCount} />
                <div className="hidden sm:block">
                  <CreateMenu />
                </div>
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
              </>
            ) : (
              <>
                <Link href="/login" className="text-sm font-medium text-muted transition hover:text-foreground">
                  Log in
                </Link>
                <Link href="/signup" className="btn-primary px-4 py-1.5">
                  Sign up
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
