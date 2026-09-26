/**
 * Circuit — starts Google sign-in: `GET /api/auth/google?intent=signin|link
 * &from=login|signup|account&next=/path`. Creates the per-attempt state /
 * PKCE / nonce secrets, stores them in the signed flow cookie, and sends
 * the browser to Google. See src/lib/oauth/ for the rest of the flow.
 */

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { safeNextPath } from "@/lib/safeRedirect";
import { buildAuthorizationUrl, createAuthSecrets, getGoogleConfig } from "@/lib/oauth/google";
import { flowCookie, oauthErrorPath, type FlowState } from "@/lib/oauth/flowCookies";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const intent = url.searchParams.get("intent") === "link" ? "link" : "signin";
  const fromParam = url.searchParams.get("from");
  const from: FlowState["from"] = intent === "link" ? "account" : fromParam === "signup" ? "signup" : "login";
  const next = safeNextPath(url.searchParams.get("next"), intent === "link" ? "/account" : "/");
  const back = (error: string) => NextResponse.redirect(new URL(oauthErrorPath(from, error, next), url));

  const config = getGoogleConfig();
  if (!config) return back("google_unavailable");

  let linkUserId: string | undefined;
  if (intent === "link") {
    const user = await getCurrentUser();
    if (!user) return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent("/account")}`, url));
    linkUserId = user.id;
  }

  const secrets = createAuthSecrets();
  const cookie = await flowCookie({ ...secrets, intent, from, next, linkUserId });
  const response = NextResponse.redirect(buildAuthorizationUrl(config, secrets, { selectAccount: true }));
  response.cookies.set(cookie.name, cookie.value, cookie.options);
  return response;
}
