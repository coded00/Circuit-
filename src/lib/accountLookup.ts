/**
 * Circuit — finding an account from what someone typed into "Email or
 * phone" (login, forgot password). Emails match case-insensitively — phone
 * keyboards capitalise the first letter, and an exact match silently found
 * nothing — against both the login identifier and the account's email.
 * Phone numbers match in any common format ("0803…", "+234 803…").
 */

import { prisma } from "@/lib/db";
import { looksLikePhone, normalizeNigerianPhone } from "@/lib/phone";

export function findUserByIdentifier(raw: string) {
  const value = raw.trim();
  if (!value) return Promise.resolve(null);

  if (!value.includes("@") && looksLikePhone(value)) {
    const phone = normalizeNigerianPhone(value);
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
