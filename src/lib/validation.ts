/**
 * Circuit — small shared request-body validators used by more than one
 * route (currently: Tournament and Battle's optional streamUrl, and the
 * community feed's post content).
 */

const COMMUNITY_POST_MAX_LENGTH = 500;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Same "absent vs present-but-invalid" shape as parseOptionalUrl below —
 *  Account Settings' own real email field (separate from signup's
 *  unvalidated emailOrPhone). Trims and lowercases before matching a
 *  standard, deliberately permissive email pattern — not RFC 5322-exact,
 *  just enough to reject a phone number or obvious typo. */
export function parseOptionalEmail(value: unknown): { ok: true; email: string | null } | { ok: false } {
  if (value === null || value === undefined || value === "") return { ok: true, email: null };
  if (typeof value !== "string") return { ok: false };
  const trimmed = value.trim().toLowerCase();
  if (!EMAIL_PATTERN.test(trimmed)) return { ok: false };
  return { ok: true, email: trimmed };
}

/** Trims, rejects empty/non-string, caps length. No rich text, no
 *  profanity filtering — a plain length cap matches this feed's
 *  deliberately lightweight scope. */
export function parseCommunityPostContent(value: unknown): { ok: true; content: string } | { ok: false } {
  if (typeof value !== "string") return { ok: false };
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > COMMUNITY_POST_MAX_LENGTH) return { ok: false };
  return { ok: true, content: trimmed };
}

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

/** Same as parseOptionalUrl, but also accepts an image uploaded through
 *  Circuit itself — stored as a site-relative `/api/images/<ref>` path
 *  (see src/lib/uploads.ts), which isn't an absolute URL. */
export function parseOptionalImageUrl(value: unknown): { ok: true; url: string | null } | { ok: false } {
  if (typeof value === "string" && /^\/api\/images\/[A-Za-z0-9_.-]+$/.test(value.trim())) {
    return { ok: true, url: value.trim() };
  }
  return parseOptionalUrl(value);
}
