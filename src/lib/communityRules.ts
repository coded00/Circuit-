/**
 * Circuit — the pure rules behind communities: names, URL slugs, tags,
 * channel names, invite codes and the discovery activity score. No
 * database access here, so every rule is unit-tested
 * (communityRules.test.ts) and shared by the API routes and the forms.
 */

import { randomBytes } from "crypto";

export const COMMUNITY_NAME_MIN = 3;
export const COMMUNITY_NAME_MAX = 40;
export const COMMUNITY_DESCRIPTION_MAX = 300;
export const COMMUNITY_RULES_MAX = 2000;
export const APPLICATION_QUESTION_MAX = 200;
export const APPLICATION_ANSWER_MAX = 500;
/** How many communities one player may own at a time. */
export const MAX_OWNED_COMMUNITIES = 3;
/** Channels per community, including the defaults. */
export const MAX_CHANNELS = 12;

const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])$/;

/** Slugs that would collide with real routes under /communities or
 *  impersonate the platform. */
const RESERVED_SLUGS = new Set([
  "new",
  "browse",
  "discover",
  "settings",
  "circuit",
  "official",
  "admin",
  "staff",
  "support",
  "help",
  "mod",
  "moderator",
  "moderators",
  "api",
  "invite",
  "null",
  "undefined",
]);

/** A URL-safe starting point from a display name, e.g. "Lagos FC Crew!" → "lagos-fc-crew". */
export function slugify(source: string): string {
  return source
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32)
    .replace(/-+$/g, "");
}

/** Normalised slug, or null if it breaks the rules or is reserved. `allowReserved` is for staff-made hubs. */
export function validateSlug(raw: string, { allowReserved = false } = {}): string | null {
  const slug = raw.trim().toLowerCase();
  if (!SLUG_PATTERN.test(slug) || slug.includes("--")) return null;
  if (!allowReserved && RESERVED_SLUGS.has(slug)) return null;
  return slug;
}

export const SLUG_RULES_MESSAGE = "Use 3–32 lowercase letters, numbers or single hyphens (not at the start or end).";

export function validateCommunityName(raw: string): string | null {
  const name = raw.replace(/\s+/g, " ").trim();
  if (name.length < COMMUNITY_NAME_MIN || name.length > COMMUNITY_NAME_MAX) return null;
  return name;
}

/** Tags are 2–5 letters/numbers, stored uppercase ("LGS", "UNILAG"). Empty → null (no tag). */
export function validateTag(raw: string): { ok: true; tag: string | null } | { ok: false } {
  const tag = raw.trim().toUpperCase();
  if (!tag) return { ok: true, tag: null };
  if (!/^[A-Z0-9]{2,5}$/.test(tag)) return { ok: false };
  if (["CRCT", "ADMIN", "STAFF", "MOD"].includes(tag)) return { ok: false };
  return { ok: true, tag };
}

/** Channel names look like Discord's: lowercase words joined by hyphens. */
export function normalizeChannelName(raw: string): string | null {
  const name = raw
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 24);
  return name.length >= 2 ? name : null;
}

/** Optional free text: trimmed, empty → null, over `max` → "too long". */
export function optionalText(raw: unknown, max: number): { ok: true; value: string | null } | { ok: false } {
  if (raw === undefined || raw === null) return { ok: true, value: null };
  if (typeof raw !== "string") return { ok: false };
  const value = raw.trim();
  if (value.length > max) return { ok: false };
  return { ok: true, value: value || null };
}

/** 8 URL-safe characters without look-alikes (no 0/O, 1/l/I). ~40 bits. */
export function generateInviteCode(): string {
  const alphabet = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(8);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

export const INVITE_CODE_PATTERN = /^[A-Za-z0-9]{6,16}$/;

export type InviteState = { revokedAt: Date | null; expiresAt: Date | null; maxUses: number | null; uses: number };

/** Why an invite can't be used, or null if it still works. */
export function inviteProblem(invite: InviteState, now = new Date()): "revoked" | "expired" | "used_up" | null {
  if (invite.revokedAt) return "revoked";
  if (invite.expiresAt && invite.expiresAt <= now) return "expired";
  if (invite.maxUses !== null && invite.uses >= invite.maxUses) return "used_up";
  return null;
}

export type ActivityStats = { messages: number; posters: number; newMembers: number };

/**
 * Discovery rank for the last 7 days. What matters is how many different
 * people are talking (posters), not raw volume: one person spamming 500
 * messages mustn't outrank twenty people chatting. Volume and new members
 * add a little, both dampened by a square root.
 */
export function activityScore({ messages, posters, newMembers }: ActivityStats): number {
  return posters * 10 + Math.sqrt(Math.max(0, messages)) * 2 + Math.sqrt(Math.max(0, newMembers)) * 3;
}

/** A community card's short "how busy is it" line. */
export function activityLabel({ posters, messages }: Pick<ActivityStats, "posters" | "messages">): string | null {
  if (posters >= 2) return `${posters} people chatting this week`;
  if (messages > 0) return "Active this week";
  return null;
}

export const COMMUNITY_CATEGORIES = [
  { value: "GAME", label: "Game" },
  { value: "LOCATION", label: "Location" },
  { value: "INTEREST", label: "Interest" },
  { value: "SCHOOL", label: "School" },
  { value: "CLUB", label: "Club" },
  { value: "ORGANISATION", label: "Organisation" },
  { value: "CREATOR", label: "Creator" },
] as const;
export type CommunityCategoryValue = (typeof COMMUNITY_CATEGORIES)[number]["value"];

export function isCommunityCategory(value: unknown): value is CommunityCategoryValue {
  return COMMUNITY_CATEGORIES.some((c) => c.value === value);
}
