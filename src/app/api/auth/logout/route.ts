import { NextResponse } from "next/server";
import { sessionCookie } from "@/lib/auth";
import { PENDING_COOKIE, clearedCookie } from "@/lib/oauth/flowCookies";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(sessionCookie.name, "", { ...sessionCookie, maxAge: 0 });
  // A half-finished Google sign-in shouldn't outlive the session either.
  const pending = clearedCookie(PENDING_COOKIE);
  response.cookies.set(pending.name, pending.value, pending.options);
  return response;
}
