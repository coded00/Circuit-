"use client";

/**
 * Circuit — admin top bar. Deliberately sparse: no search, no
 * notifications, no "+ Create" menu — those are player-surface concerns.
 * Just where you are (each page sets its own `<h1>` in its content, this
 * bar doesn't duplicate a title) and who's signed in, with a fast way
 * back out. A direct "Log out" button rather than a dropdown menu — one
 * real action doesn't need a disclosure to hide behind.
 *
 * Below `sm`, AdminSidebar is hidden entirely (see its own comment), so
 * this bar also carries the hamburger trigger for AdminMobileNav's
 * drawer — and drops "View Site" (a convenience, not essential admin
 * functionality) to keep the row from crowding on a narrow phone.
 */

import { useRouter } from "next/navigation";
import Link from "next/link";
import { LogOut, ExternalLink } from "lucide-react";
import { AdminMobileNav } from "./AdminMobileNav";

export function AdminTopBar({
  admin,
}: {
  admin: { displayName: string; avatarUrl: string | null };
}) {
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="flex h-[64px] shrink-0 items-center justify-between border-b border-border px-4 sm:px-8">
      <div className="flex items-center gap-3">
        <AdminMobileNav />
        <span className="text-eyebrow text-muted-strong">Circuit Admin</span>
      </div>

      <div className="flex items-center gap-4">
        <Link
          href="/"
          target="_blank"
          className="hidden items-center gap-1.5 text-sm font-medium text-muted transition hover:text-foreground sm:flex"
        >
          View Site
          <ExternalLink size={13} />
        </Link>

        <div className="hidden h-5 w-px bg-border sm:block" aria-hidden />

        <div className="flex items-center gap-2.5">
          {admin.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- external, unpredictable-host avatar URLs
            <img src={admin.avatarUrl} alt="" className="h-8 w-8 rounded-full border border-border object-cover" />
          ) : (
            <div className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-surface-elevated text-xs font-semibold text-muted">
              {admin.displayName.slice(0, 1).toUpperCase()}
            </div>
          )}
          <span className="hidden text-sm font-medium sm:inline">{admin.displayName}</span>
        </div>

        <button
          type="button"
          onClick={handleLogout}
          aria-label="Log out"
          title="Log out"
          className="btn-icon"
        >
          <LogOut size={16} />
        </button>
      </div>
    </header>
  );
}
