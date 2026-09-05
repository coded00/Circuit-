/**
 * Circuit — small shared request-body validators used by more than one
 * route (currently: Tournament and Battle's optional streamUrl).
 */

/** Returns the trimmed URL if it's a well-formed http(s) URL, null if the
 *  field was empty/omitted, or throws-as-error-string via the caller's own
 *  400 response if malformed — callers distinguish "absent" (null) from
 *  "present but invalid" themselves since the required response differs. */
export function parseOptionalUrl(value: unknown): { ok: true; url: string | null } | { ok: false } {
  if (value === null || value === undefined || value === "") return { ok: true, url: null };
  if (typeof value !== "string") return { ok: false };
  const trimmed = value.trim();
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return { ok: false };
    return { ok: true, url: trimmed };
  } catch {
    return { ok: false };
  }
}
