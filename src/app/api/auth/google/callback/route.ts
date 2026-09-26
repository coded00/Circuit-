/**
 * Circuit — Google's redirect back. In order:
 *   1. Google reported an error (the user pressed Cancel, …) → back to the
 *      starting page with a friendly message.
 *   2. The signed flow cookie must exist and its `state` must match
 *      (CSRF / replay / expired attempt). It's deleted either way.
 *   3. Exchange the code (PKCE) and verify the ID token → a verified
 *      Google identity.
 *   4. Connecting from Account settings → attach it to the signed-in user.
 *      Otherwise resolve it (src/lib/oauth/accounts.ts): existing account
 *      → session; email match → confirm-password step; nothing → the
 *      new-account step.
 */

import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createSessionToken, sessionCookie } from "@/lib/auth";
import { getCurrentUser } from "@/lib/session";
import { exchangeCodeForProfile, getGoogleConfig, GoogleAuthError } from "@/lib/oauth/google";
import { attachGoogleIdentity, IdentityConflictError, resolveGoogleSignIn } from "@/lib/oauth/accounts";
import { clearedCookie, FLOW_COOKIE, oauthErrorPath, pendingCookie, readFlowCookie } from "@/lib/oauth/flowCookies";

const ERROR_BY_GOOGLE_CODE: Record<GoogleAuthError["code"], string> = {
  network: "google_network",
  exchange: "google_failed",
  invalid_token: "google_failed",
  unverified_email: "google_unverified",
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const flow = await readFlowCookie((await cookies()).get(FLOW_COOKIE)?.value);

  const redirect = (path: string) => {
    const res = NextResponse.redirect(new URL(path, url));
    const cleared = clearedCookie(FLOW_COOKIE, "/api/auth/google");
    res.cookies.set(cleared.name, cleared.value, cleared.options);
    return res;
  };
  const fail = (error: string) => redirect(oauthErrorPath(flow?.from ?? "login", error, flow?.next ?? "/"));

  const googleError = url.searchParams.get("error");
  if (googleError) return fail(googleError === "access_denied" ? "google_cancelled" : "google_failed");

  const config = getGoogleConfig();
  if (!config) return fail("google_unavailable");
  const code = url.searchParams.get("code");
  if (!flow || !code || url.searchParams.get("state") !== flow.state) return fail("google_expired");

  let profile;
  try {
    profile = await exchangeCodeForProfile(config, code, flow.codeVerifier, flow.nonce);
  } catch (err) {
    return fail(err instanceof GoogleAuthError ? ERROR_BY_GOOGLE_CODE[err.code] : "google_failed");
  }

  // Connecting Google from Account settings: the same user must still be
  // signed in as when the flow started.
  if (flow.intent === "link") {
    const user = await getCurrentUser();
    if (!user || user.id !== flow.linkUserId) return fail("google_session");
    try {
      await attachGoogleIdentity(user.id, profile);
    } catch (err) {
      if (err instanceof IdentityConflictError) return redirect(`/account?google=${err.code === "taken" ? "taken" : "already_linked"}`);
      throw err;
    }
    return redirect("/account?google=linked");
  }

  const resolution = await resolveGoogleSignIn(profile);
  if (resolution.type === "conflict") return fail("google_conflict");

  if (resolution.type === "existing") {
    const res = redirect(flow.next);
    res.cookies.set(sessionCookie.name, await createSessionToken({ userId: resolution.userId }), sessionCookie);
    return res;
  }

  const pending = await pendingCookie(
    resolution.type === "link"
      ? { kind: "link", profile, userId: resolution.userId, next: flow.next }
      : { kind: "new", profile, next: flow.next }
  );
  const res = redirect(resolution.type === "link" ? "/login/link" : "/signup/complete");
  res.cookies.set(pending.name, pending.value, pending.options);
  return res;
}
