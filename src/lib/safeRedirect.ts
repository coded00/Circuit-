/**
 * Circuit — where to send someone after they sign in. `?next=` arrives
 * from the URL, so it's only honoured as a same-site path: "/…" but not
 * "//…" or "/\…" (both of which browsers treat as another host), never
 * a full URL. Anything else falls back to the homepage.
 *
 * The auth pages themselves are never a valid `next`: they send a
 * signed-in visitor on to `next`, so `/login?next=/login` would bounce
 * forever. API routes aren't pages, so they're refused too.
 */

const AUTH_PATHS = ["/login", "/signup", "/forgot-password", "/reset-password"];

function isAuthPath(pathname: string): boolean {
  return AUTH_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function safeNextPath(next: string | null | undefined, fallback = "/"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return fallback;
  // Backslashes and control characters (browsers strip tabs/newlines, so
  // "/\t/evil.com" would become "//evil.com") are never legitimate here.
  if (/[\\\u0000-\u001f\u007f]/.test(next)) return fallback;
  const pathname = next.split(/[?#]/)[0];
  if (isAuthPath(pathname) || pathname === "/api" || pathname.startsWith("/api/")) return fallback;
  return next;
}

/** The login (or signup) page, returning to `next` afterwards. Always encoded. */
export function loginPath(next: string, page: "login" | "signup" = "login"): string {
  const safe = safeNextPath(next);
  return safe === "/" ? `/${page}` : `/${page}?next=${encodeURIComponent(safe)}`;
}

export const signupPath = (next: string) => loginPath(next, "signup");
