"use client";

import { useEffect, ViewTransition } from "react";
import { usePathname } from "next/navigation";
import { MaintenancePage } from "@/components/MaintenancePage";
import { NavigationDirection, noteNavigationSettled } from "@/components/NavigationDirection";

const BARE_ROUTES = ["/start", "/login", "/signup", "/forgot-password", "/reset-password", "/welcome", "/admin"];

/** Level 2 of Circuit's motion hierarchy (globals.css's own comment on
 *  `.arena-transition` has the full breakdown) is deliberately scoped to
 *  "you're in the arena" pages — tournament/battle detail, the bracket,
 *  and (since the Video Feed took over `/ladder`) the feed itself, a
 *  full-bleed HUD-styled surface that fits this treatment much better
 *  than the leaderboard page that used to live there — not creation/edit/
 *  register forms or browsing pages like /compete, and not `/new` (which
 *  would otherwise false-match the same `/tournaments/[id]` pattern). */
/** Chat pages pin a `position: fixed` panel on mobile — see `.page-shell-fade`. */
function isChatRoute(pathname: string): boolean {
  return pathname === "/communities" || /^\/tournaments\/[^/]+\/community$/.test(pathname);
}

function isArenaRoute(pathname: string): boolean {
  if (/^\/tournaments\/(?!new$)[^/]+(\/bracket)?$/.test(pathname)) return true;
  if (/^\/battles\/(?!new$)[^/]+$/.test(pathname)) return true;
  if (pathname === "/ladder") return true;
  return false;
}

/**
 * Circuit — decides whether a route gets the normal player app shell
 * (sidebar + top bar + mobile tab bar) or the bare page. The four auth
 * routes (login/signup/forgot-password/reset-password) render full-bleed
 * via their own `AuthSplitLayout` instead — a sidebar/top bar advertising
 * "Log in"/"Sign up" on top of the login form itself was redundant chrome,
 * not a real navigation need. `/admin` is bare for a different reason: it's
 * a separate control-center surface with its own sidebar/top bar (see
 * `src/app/admin/layout.tsx`), not a page within the player nav.
 *
 * `sidebar`/`topBar`/`mobileTabBar` arrive pre-rendered from the (server
 * component) root layout — `TopBar` is itself an async Server Component,
 * which a "use client" module can never import and render directly, only
 * receive already-rendered via props/children. This component's only job
 * is the pathname check; it never re-renders those props' own internals.
 */
export function AppShell({
  sidebar,
  topBar,
  mobileTabBar,
  maintenanceMode = false,
  isStaffUser = false,
  children,
}: {
  sidebar: React.ReactNode;
  topBar: React.ReactNode;
  mobileTabBar: React.ReactNode;
  /** Settings > Platform Settings. Non-staff visitors see `MaintenancePage`
   *  instead of the real app; the bare routes (login, /admin) stay
   *  reachable regardless, so staff can always sign in and turn it back
   *  off. */
  maintenanceMode?: boolean;
  isStaffUser?: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  useEffect(() => noteNavigationSettled(pathname), [pathname]);
  const isBareRoute = BARE_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`));

  if (isBareRoute) {
    return <>{children}</>;
  }

  if (maintenanceMode && !isStaffUser) {
    return <MaintenancePage />;
  }

  return (
    <>
      {/* Soft colour behind everything (dark theme only). */}
      <div aria-hidden className="app-ambient" />
      <div className="relative z-[1] mx-auto grid min-h-full w-full max-w-[1920px] grid-cols-1 pb-[calc(7rem_+_env(safe-area-inset-bottom))] sm:grid-cols-[var(--sidebar-width-sm)_1fr] sm:pb-0 lg:grid-cols-[var(--sidebar-width-lg)_1fr]">
        <div>{sidebar}</div>
        <div className="flex min-w-0 flex-col">
          {topBar}
          {/* TopBar is `fixed` (see its own comment for why), so it no
              longer reserves space in this flex column — this padding
              replaces that reserved space, matching the header's Phase-3
              spec height (~60px), so content starts right where the
              header visually ends instead of underneath it. */}
          <main className="flex flex-1 flex-col pt-[60px]">
            {/* Level 1, every navigation: a view transition keyed by
                pathname, so each real page change is an exit/enter pair.
                `page-exit`/`page-enter` are styled in globals.css — slide
                forward/back by <html data-nav-dir> (NavigationDirection),
                crossfade otherwise. Same-path changes (tabs, filters,
                search params) don't change the key, so the page itself
                stays put and only keyed content inside it animates.
                `.arena-transition` (Level 2, globals.css) layers a volt
                scan line + brief glitch on top for isArenaRoute — the new
                key mounts a fresh node, so its CSS animation replays. */}
            <ViewTransition key={pathname} enter="page-enter" exit="page-exit" default="none">
              {/* .page-shell: the CSS entrance for browser back/forward,
                  which get no view transition (see NavigationDirection).
                  Its own element, so it never competes with
                  .arena-transition's animation. Chat routes fade only:
                  a transform would re-anchor their fixed mobile panel. */}
              <div className={`page-shell flex flex-1 flex-col ${isChatRoute(pathname) ? "page-shell-fade" : ""}`}>
                <div className={`flex flex-1 flex-col ${isArenaRoute(pathname) ? "arena-transition" : ""}`}>{children}</div>
              </div>
            </ViewTransition>
          </main>
        </div>
      </div>
      {mobileTabBar}
      <NavigationDirection />
    </>
  );
}
