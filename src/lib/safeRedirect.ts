/**
 * Circuit — where to send someone after they sign in. `?next=` arrives
 * from the URL, so it's only honoured as a same-site path: "/…" but not
 * "//…" or "/\…" (both of which browsers treat as another host), never
 * a full URL. Anything else falls back to the homepage.
 */
export function safeNextPath(next: string | null | undefined, fallback = "/"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}
