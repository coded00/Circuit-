import Link from "next/link";
import type { User } from "@prisma/client";
import { prisma } from "@/lib/db";
import { SearchInput } from "@/components/SearchInput";
import { NotificationBell } from "@/components/NotificationBell";
import { CreateMenu } from "./CreateMenu";
import { AccountMenu } from "./AccountMenu";

export async function TopBar({ user }: { user: User | null }) {
  const unreadCount = user
    ? await prisma.notification.count({ where: { userId: user.id, readAt: null } })
    : 0;

  return (
    <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-background/80 px-4 py-3 backdrop-blur-md sm:px-6">
      {/* AppSidebar carries the logo at sm: and up (it's hidden below
          that breakpoint) — mobile has no persistent sidebar, so the
          logo needs its own home here, shown only below sm:. */}
      <Link href="/" className="flex shrink-0 items-center gap-1.5 font-semibold tracking-tight sm:hidden">
        <span className="h-2 w-2 rounded-full bg-brand" />
        Circuit
      </Link>

      <SearchInput className="hidden min-w-0 flex-1 sm:block" />

      <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
        {user ? (
          <>
            <CreateMenu />
            <NotificationBell initialUnreadCount={unreadCount} />
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
