import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Circuit — exposes the current pathname to Server Components via a
 * request header. SiteHeader/BottomTabBar need to know if they're on a
 * /dashboard/* route (to switch data-zone + collapse nav) without paying
 * for client-side usePathname() on components that do zero client work.
 */
export function proxy(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", request.nextUrl.pathname);
  return NextResponse.next({ request: { headers: requestHeaders } });
}
