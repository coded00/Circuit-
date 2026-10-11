/**
 * Circuit — two jobs on the way in, both cheap and neither of them an auth decision. Each page and layout
 * still guards itself with getCurrentUser(); nothing here redirects, rewrites or decides who may see what.
 *
 * 1. The Content-Security-Policy, enforced (security audit finding #10).
 * 2. The requested path, for the /admin and /dashboard guards, which cannot see it otherwise — see
 *    src/lib/requestPath.ts. That is why the matcher covers every page rather than those two alone: job 1
 *    is only worth doing if it covers every page, and job 2 comes along for free.
 *
 * On the policy itself. It used to be `Content-Security-Policy-Report-Only` in next.config.ts, so it
 * blocked nothing, and its script-src carried 'unsafe-inline', so it would not have blocked an injected
 * script even once enforced. It is now enforced, and scripts are allowed by a per-request nonce instead of
 * by 'unsafe-inline' — which is the entire finding. An attacker who finds an injection sink still has to
 * guess a 128-bit value that did not exist when they wrote the payload.
 *
 * The cost of a nonce is that pages must be dynamically rendered: Next applies the nonce during
 * server-side rendering, reading it out of the policy on the *request*, and a page prerendered at build
 * time has no request to take one from. That cost is zero here. Every page in this app is already dynamic
 * — the root layout calls getCurrentUser(), which reads cookies() — and the production build prints 272
 * routes, all ƒ. The only two prerendered routes are /icon.png and /apple-icon.png, which carry no script.
 *
 * Two things in this policy are deliberate rather than leftovers:
 *
 * - **No 'strict-dynamic'.** It would make browsers ignore the host allow-list, and OneSignal's SDK is
 *   loaded at runtime by react-onesignal as a plain `document.createElement("script")` pointing at
 *   https://cdn.onesignal.com. With the allow-list it keeps working; with 'strict-dynamic' it would rest
 *   on trust propagating from a nonce'd script through createElement. That may well work, but the failure
 *   mode is push notifications going quietly dead, and there is nothing to buy by taking the risk.
 * - **style-src keeps 'unsafe-inline', and takes no nonce.** The audit's fix is about scripts. Inline
 *   styles are everywhere (React style props, Tailwind) and a nonce in style-src would switch
 *   'unsafe-inline' off for styles as well, which does not need to be in this change.
 */

import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { REQUEST_PATH_HEADER } from "@/lib/requestPathHeader";

/**
 * The policy, built per request because the nonce is per request. Kept as its own function so the exact
 * string is readable in one place rather than assembled inline among the headers.
 *
 * `'unsafe-eval'` is development-only: React uses eval to rebuild server-side error stacks in the browser.
 * Neither React nor Next.js use it in production, so it is not in the production policy — and `npm run
 * dev` is what the e2e suite drives locally, so leaving it out would break the suite rather than the app.
 */
export function contentSecurityPolicy(nonce: string, isDev: boolean): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' https://cdn.onesignal.com${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self' https://onesignal.com https://*.onesignal.com",
    "frame-src https://www.youtube.com https://www.youtube-nocookie.com https://player.twitch.tv https://player.kick.com",
    "media-src 'self' blob: https:",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'",
    "report-uri /api/csp-report",
  ].join("; ");
}

export function proxy(request: NextRequest) {
  const nonce = randomBytes(16).toString("base64");
  const policy = contentSecurityPolicy(nonce, process.env.NODE_ENV === "development");

  const url = request.nextUrl.clone();
  url.searchParams.delete("_rsc");

  const headers = new Headers(request.headers);
  // Always overwritten, so a client can't supply its own value.
  headers.set(REQUEST_PATH_HEADER, url.pathname + url.search);
  // Both of these are load-bearing and it is the pair that matters: Next reads the nonce out of the policy
  // on the *request* and stamps it onto the scripts it renders, while the policy on the *response* is the
  // one the browser enforces. Setting only the response header gives a policy with a nonce nothing carries
  // — every script blocked, which looks like the policy working and is the app being broken. Only the
  // request header gives the opposite: scripts carrying a nonce no browser was ever told about.
  headers.set("Content-Security-Policy", policy);
  // Next uses this internally, and it is the documented way for a server component to read the nonce if one
  // ever needs to render its own <Script>. Nothing does today; it is the contract, so it is set.
  headers.set("x-nonce", nonce);

  const response = NextResponse.next({ request: { headers } });
  response.headers.set("Content-Security-Policy", policy);
  return response;
}

export const config = {
  /**
   * Every page, but not the things that are not pages: API responses and static assets have no document to
   * put a policy on. Prefetch requests are skipped because they render no page either, only a payload. The
   * `(?!api…)` lookahead only matches the literal segment — `api` is the sole top-level route beginning
   * with those three letters, so no page is caught by it.
   */
  matcher: [
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
