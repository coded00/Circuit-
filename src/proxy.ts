/**
 * Circuit — tells a layout which page is being requested. Layouts don't
 * receive the pathname, so the /admin and /dashboard guards (which run in
 * their layouts) could only send a signed-out visitor to
 * `/login?next=/admin`, losing the deep link they opened. This forwards the
 * requested path as a request header; see src/lib/requestPath.ts.
 *
 * Nothing else: no auth decisions, redirects or rewrites happen here —
 * each page/layout still guards itself via getCurrentUser().
 */

import { NextResponse, type NextRequest } from "next/server";
import { REQUEST_PATH_HEADER } from "@/lib/requestPathHeader";

export function proxy(request: NextRequest) {
  const url = request.nextUrl.clone();
  url.searchParams.delete("_rsc");
  const headers = new Headers(request.headers);
  // Always overwritten, so a client can't supply its own value.
  headers.set(REQUEST_PATH_HEADER, url.pathname + url.search);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ["/admin/:path*", "/dashboard/:path*"],
};
