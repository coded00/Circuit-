import Link from "next/link";
import type { User } from "@prisma/client";
import { prisma } from "@/lib/db";
import { SearchInput } from "@/components/SearchInput";
import { NotificationBell } from "@/components/NotificationBell";
import { CreateMenu } from "./CreateMenu";
import { AccountMenu } from "./AccountMenu";
import { MobileSearchToggle } from "./MobileSearchToggle";

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
 * The header spans edge-to-edge horizontally rather than sitting inside
 * the grid column that used to carry it (fixed positioning isn't part of
 * that grid), offset by `left-*` to clear the sidebar at each of its own
 * responsive widths (0 on mobile where the sidebar is hidden, 72px at
 * `sm`, 180px at `lg` — see AppSidebar.tsx).
 *
 * Header actions: Notifications, Create, Profile — "Go Live" was removed
 * (Watch/Live/streaming are out of MVP scope for this rework; the button
 * is gone, `.btn-golive`'s two remaining disabled usages elsewhere are
 * being retired in the same pass).
 */
export async function TopBar({ user }: { user: User | null }) {
  const unreadCount = user
    ? await prisma.notification.count({ where: { userId: user.id, readAt: null } })
    : 0;

  return (
    <header className="fixed inset-x-0 top-0 z-30 flex h-[60px] items-center gap-4 border-b border-border bg-background/85 px-5 backdrop-blur-md sm:left-[72px] sm:px-8 lg:left-[180px]">
      <Link href="/" className="flex shrink-0 items-center gap-1.5 font-display font-bold tracking-wide sm:hidden">
        <span className="h-2 w-2 rounded-full bg-accent-volt" />
        CIRCUIT
      </Link>

      <SearchInput className="hidden min-w-0 flex-1 sm:block sm:max-w-[430px]" />

      <div className="ml-auto flex shrink-0 items-center gap-3">
        <MobileSearchToggle />
        {user ? (
          <>
            <NotificationBell initialUnreadCount={unreadCount} />
            <CreateMenu />
            <AccountMenu
              user={{
                handle: user.handle,
                displayName: user.displayName,
                avatarUrl: user.avatarUrl,
                isStaff: user.isStaff,
              }}
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
    </header>
  );
}
