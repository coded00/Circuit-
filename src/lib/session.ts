/**
 * Circuit — current-user lookup for Server Components and route handlers.
 *
 * Reads the session cookie set by the signup/login routes (src/lib/auth.ts),
 * verifies it, and resolves the User row it points at. Returns null on any
 * failure (no cookie, expired/tampered token, deleted user) rather than
 * throwing — callers decide whether that means "redirect to /login" (a page)
 * or "401" (a route handler).
 */

import { cookies } from "next/headers";
import type { User } from "@prisma/client";
import { sessionCookie, verifySessionToken } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function getCurrentUser(): Promise<User | null> {
  const store = await cookies();
  const token = store.get(sessionCookie.name)?.value;
  if (!token) return null;

  const session = await verifySessionToken(token);
  if (!session) return null;

  return prisma.user.findUnique({ where: { id: session.userId } });
}
