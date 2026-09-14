"use client";

import { usePathname } from "next/navigation";
import { MaintenancePage } from "@/components/MaintenancePage";

const BARE_ROUTES = ["/login", "/signup", "/forgot-password", "/reset-password", "/admin"];

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
  const isBareRoute = BARE_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`));

  if (isBareRoute) {
    return <>{children}</>;
  }

  if (maintenanceMode && !isStaffUser) {
    return <MaintenancePage />;
  }

  return (
    <>
      <div className="mx-auto grid min-h-full w-full max-w-[1920px] grid-cols-1 pb-28 sm:grid-cols-[72px_1fr] sm:pb-0 lg:grid-cols-[180px_1fr]">
        <div>{sidebar}</div>
        <div className="flex min-w-0 flex-col">
          {topBar}
          {/* TopBar is `fixed` (see its own comment for why), so it no
              longer reserves space in this flex column — this padding
              replaces that reserved space, matching the header's Phase-3
              spec height (~60px), so content starts right where the
              header visually ends instead of underneath it. */}
          <main className="flex flex-1 flex-col pt-[60px]">{children}</main>
        </div>
      </div>
      {mobileTabBar}
    </>
  );
}
