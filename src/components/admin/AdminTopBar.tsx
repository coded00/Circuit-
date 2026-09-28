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

import { logout } from "@/lib/logout";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, ExternalLink } from "lucide-react";
import { AdminMobileNav } from "./AdminMobileNav";
import { adminSectionFor } from "./AdminSidebar";

export function AdminTopBar({
  admin,
}: {
  admin: { displayName: string; avatarUrl: string | null };
}) {

  const section = adminSectionFor(usePathname());

  function handleLogout() {
    void logout("/login");
  }

  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center justify-between border-b border-border bg-background/90 px-4 backdrop-blur sm:px-8">
      <div className="flex min-w-0 items-center gap-2 text-[13px]">
        <AdminMobileNav />
        <span className="hidden text-muted-strong sm:inline">Admin</span>
        {section && (
          <>
            <span className="hidden text-muted-strong sm:inline" aria-hidden>
              /
            </span>
            <span className="truncate font-medium text-foreground">{section.label}</span>
          </>
        )}
      </div>

      <div className="flex items-center gap-4">
        <Link
          href="/"
          target="_blank"
          className="hidden items-center gap-1.5 text-[13px] font-medium text-muted transition hover:text-foreground sm:flex"
        >
          View Site
          <ExternalLink size={13} />
        </Link>

        <div className="hidden h-5 w-px bg-border sm:block" aria-hidden />

        <div className="flex items-center gap-2.5">
          {admin.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- external, unpredictable-host avatar URLs
            <img src={admin.avatarUrl} alt="" className="h-7 w-7 rounded-full border border-border object-cover" />
          ) : (
            <div className="flex h-7 w-7 items-center justify-center rounded-full border border-border bg-surface-elevated text-[11px] font-semibold text-muted">
              {admin.displayName.slice(0, 1).toUpperCase()}
            </div>
          )}
          <span className="hidden text-[13px] font-medium sm:inline">{admin.displayName}</span>
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
