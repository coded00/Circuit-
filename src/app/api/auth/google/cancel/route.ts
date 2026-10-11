import { NextResponse } from "next/server";
import { clearedCookie, PENDING_COOKIE } from "@/lib/oauth/flowCookies";

/** Circuit — abandons a pending Google sign-up/link (the "Cancel" / "Use a different account" actions). */
export async function POST() {
  const response = NextResponse.json({ ok: true });
  const cleared = clearedCookie(PENDING_COOKIE);
  response.cookies.set(cleared.name, cleared.value, cleared.options);
  return response;
}
