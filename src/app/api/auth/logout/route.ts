/**
 * Circuit — signing out (finding #12 of the security audit).
 *
 * Clearing the cookie ends the session in *this* browser, but on its own it does not end the session
 * itself. The token that carried this request stays valid until it expires, so a copy taken before the
 * user pressed "Log out" — off a shared machine's disk, out of a backup, from anything that saw the
 * request — would keep working for the rest of its 30-day TTL. Anyone holding it was still signed in.
 *
 * So this also revokes the token, using the counter every session lookup already compares against
 * (src/lib/session.ts) — the same mechanism a password change, a password reset and a suspension use.
 * Nothing new to keep in sync.
 *
 * That counter belongs to the account, not to a device, so logging out on one device signs that account
 * out everywhere. There is no narrower handle available: a session token carries a user id and a version
 * and nothing else, and revoking a single session would mean giving each one an identity and a row to
 * revoke — a schema and a lookup on the hot path of every request, for a platform where ending every
 * session is the safer reading of the button anyway.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sessionCookie } from "@/lib/auth";
import { getCurrentUser } from "@/lib/session";
import { captureException } from "@/lib/observability";
import { PENDING_COOKIE, clearedCookie } from "@/lib/oauth/flowCookies";

export async function POST() {
  const user = await getCurrentUser();

  if (user) {
    try {
      // Conditional on the version this token carried rather than an unconditional increment. If the
      // version has already moved, some other path revoked this token before we got here and there is
      // nothing left to do — but bumping again would take out a session created *since*, which is how a
      // logout would end up signing out a device that had just signed in.
      await prisma.user.updateMany({
        where: { id: user.id, sessionVersion: user.sessionVersion },
        data: { sessionVersion: { increment: 1 } },
      });
    } catch (err) {
      // The cookies still get cleared below, deliberately. If revocation fails — the database is
      // unreachable — a button that does nothing leaves someone unable to sign out of a shared device,
      // which is worse than a token that outlives its session. The failure is reported rather than
      // swallowed, so a revocation rate that has dropped to zero is visible.
      captureException(err, { source: "auth/logout:revoke", userId: user.id });
    }
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(sessionCookie.name, "", { ...sessionCookie, maxAge: 0 });
  // A half-finished Google sign-in shouldn't outlive the session either.
  const pending = clearedCookie(PENDING_COOKIE);
  response.cookies.set(pending.name, pending.value, pending.options);
  return response;
}
