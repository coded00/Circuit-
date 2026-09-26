/**
 * Circuit — username (handle) rules, shared by email signup and Google
 * onboarding so both accept exactly the same names.
 */

export const HANDLE_PATTERN = /^[a-z0-9_]{3,20}$/;

// Names that would be confusing or impersonation-prone as a public handle.
const RESERVED_HANDLES = new Set([
  "admin",
  "administrator",
  "staff",
  "support",
  "help",
  "circuit",
  "official",
  "moderator",
  "mod",
  "root",
  "system",
  "api",
  "null",
  "undefined",
]);

export const HANDLE_RULES_MESSAGE = "Username must be 3-20 characters, using only letters, numbers, and underscores.";

/** Normalised handle, or null if it breaks the rules or is reserved. */
export function validateHandle(raw: string): string | null {
  const handle = raw.trim().toLowerCase();
  if (!HANDLE_PATTERN.test(handle) || RESERVED_HANDLES.has(handle)) return null;
  return handle;
}

/** A starting suggestion from a name or email — not guaranteed free. */
export function handleFromName(source: string): string {
  const base = source
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/@.*$/, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 16);
  const padded = base.length >= 3 ? base : `${base}player`.slice(0, 16);
  return RESERVED_HANDLES.has(padded) ? `${padded}_1` : padded;
}
