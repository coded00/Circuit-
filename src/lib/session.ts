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
import { NextResponse } from "next/server";
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

type AuthGateResult = { user: User; error: null } | { user: null; error: NextResponse };

/** The `if (!user) 401; if (!user.isStaff) 403;` pair, previously repeated
 *  identically across ~12 admin/staff API routes — one place instead of
 *  a dozen copies, so a future route can't ship without the check by a
 *  copy-paste omission. Callers do:
 *    const auth = await requireStaff();
 *    if (auth.error) return auth.error;
 *    const admin = auth.user;
 */
export async function requireStaff(): Promise<AuthGateResult> {
  const user = await getCurrentUser();
  if (!user) return { user: null, error: NextResponse.json({ error: "You must be signed in." }, { status: 401 }) };
  if (!user.isStaff) return { user: null, error: NextResponse.json({ error: "Staff access required." }, { status: 403 }) };
  return { user, error: null };
}

/** Same shape as requireStaff, gated on adminRole === "SUPER_ADMIN"
 *  instead — `message` lets each caller keep its own existing, more
 *  specific wording ("Only a Super Admin can grant admin access.", etc.)
 *  rather than forcing one generic string on every route. */
export async function requireSuperAdmin(message = "Only a Super Admin can do that."): Promise<AuthGateResult> {
  const user = await getCurrentUser();
  if (!user) return { user: null, error: NextResponse.json({ error: "You must be signed in." }, { status: 401 }) };
  if (user.adminRole !== "SUPER_ADMIN") return { user: null, error: NextResponse.json({ error: message }, { status: 403 }) };
  return { user, error: null };
}
