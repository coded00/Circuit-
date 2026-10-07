/**
 * Circuit — finding an account from what someone typed into "Email or
 * phone" (login, forgot password). Emails match case-insensitively — phone
 * keyboards capitalise the first letter, and an exact match silently found
 * nothing — against both the login identifier and the account's email.
 * Phone numbers match in any common format ("0803…", "+234 803…").
 */

import { prisma } from "@/lib/db";
import { looksLikePhone, normalizeNigerianPhone } from "@/lib/phone";

/**
 * How what someone typed is read: the trimmed value, whether it is phone-shaped, and its canonical phone
 * form when it is one. The single place both the lookup and the throttle key derive from — if they normalise
 * differently the throttle silently stops covering the account, which is exactly what went wrong before.
 */
function readIdentifier(raw: string): { value: string; phoneLike: boolean; phone: string | null } {
  const value = raw.trim();
  const phoneLike = !!value && !value.includes("@") && looksLikePhone(value);
  return { value, phoneLike, phone: phoneLike ? normalizeNigerianPhone(value) : null };
}

export function findUserByIdentifier(raw: string) {
  const { value, phoneLike, phone } = readIdentifier(raw);
  if (!value) return Promise.resolve(null);

  if (phoneLike) {
    return prisma.user.findFirst({
      where: { OR: [...(phone ? [{ phone }] : []), { emailOrPhone: value }] },
      orderBy: { createdAt: "asc" },
    });
  }

  return prisma.user.findFirst({
    where: {
      OR: [{ emailOrPhone: { equals: value, mode: "insensitive" } }, { email: { equals: value, mode: "insensitive" } }],
    },
    orderBy: { createdAt: "asc" },
  });
}

/** Emails lower-cased; phone numbers reduced to their one canonical spelling (+234…). */
export function normalizeIdentifier(raw: string): string {
  const { value, phone } = readIdentifier(raw);
  return phone ?? value.toLowerCase();
}

/**
 * The key a per-account throttle (login, forgot-password) must use — never the raw typed string.
 *
 * findUserByIdentifier deliberately folds every common spelling of a phone number onto one account:
 * "08031234567", "0803 123 4567", "0803-123-4567", "+2348031234567" and more are all the same person. A
 * throttle keyed on the raw string therefore gave that one account a fresh bucket per spelling, which is the
 * throttle's whole job undone — each new spelling bought another full window of password guesses, and
 * another window of reset mail to the victim.
 *
 * Keying on the account's id once the lookup has resolved is what makes that impossible rather than merely
 * harder: whatever spelling arrives, the bucket is the same row. The normalised identifier is the fallback
 * for one that matches no account, so probing identifiers that don't exist stays bounded too.
 */
export function throttleKeyFor(user: { id: string } | null, raw: string): string {
  return user?.id ?? normalizeIdentifier(raw);
}
