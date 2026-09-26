/**
 * Circuit — the two short-lived, signed, httpOnly cookies that carry a
 * social sign-in between requests. Neither holds a provider token.
 *
 * - `circuit_oauth` (10 min, only sent to /api/auth/google): the
 *   per-attempt `state`, PKCE verifier and nonce, plus where to return and
 *   why the flow started. The callback checks `state` against it (CSRF)
 *   and deletes it, so a response can't be replayed.
 * - `circuit_oauth_pending` (15 min): a verified Google identity that
 *   still needs one more step — choosing a username (new account) or
 *   confirming the existing account's password (linking).
 *
 * Signed with a key derived from JWT_SECRET for this purpose only, and
 * typed via `aud`, so neither can ever be accepted as a session token (or
 * as each other).
 */

import { createHash } from "crypto";
import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import type { GoogleProfile } from "./google";

export const FLOW_COOKIE = "circuit_oauth";
export const PENDING_COOKIE = "circuit_oauth_pending";

const FLOW_TTL_SECONDS = 10 * 60;
const PENDING_TTL_SECONDS = 15 * 60;

function key(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not set.");
  return createHash("sha256").update(`${secret}:oauth-flow`).digest();
}

export type OAuthIntent = "signin" | "link";

export type FlowState = {
  state: string;
  codeVerifier: string;
  nonce: string;
  intent: OAuthIntent;
  /** Page the flow started from — where an error sends them back to. */
  from: "login" | "signup" | "account";
  next: string;
  /** For intent "link": the signed-in user the identity will attach to. */
  linkUserId?: string;
};

export type PendingSignIn =
  | { kind: "new"; profile: GoogleProfile; next: string }
  | { kind: "link"; profile: GoogleProfile; userId: string; next: string };

async function sign(payload: JWTPayload, audience: string, ttl: number) {
  return new SignJWT(payload).setProtectedHeader({ alg: "HS256" }).setAudience(audience).setIssuedAt().setExpirationTime(`${ttl}s`).sign(key());
}

async function verify<T>(token: string | undefined, audience: string): Promise<T | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(), { audience });
    return payload.data as T;
  } catch {
    return null;
  }
}

const secure = process.env.NODE_ENV === "production";

export async function flowCookie(state: FlowState) {
  return {
    name: FLOW_COOKIE,
    value: await sign({ data: state }, "circuit-oauth-flow", FLOW_TTL_SECONDS),
    options: { httpOnly: true, sameSite: "lax" as const, secure, path: "/api/auth/google", maxAge: FLOW_TTL_SECONDS },
  };
}

export const readFlowCookie = (token: string | undefined) => verify<FlowState>(token, "circuit-oauth-flow");

export async function pendingCookie(pending: PendingSignIn) {
  return {
    name: PENDING_COOKIE,
    value: await sign({ data: pending }, "circuit-oauth-pending", PENDING_TTL_SECONDS),
    options: { httpOnly: true, sameSite: "lax" as const, secure, path: "/", maxAge: PENDING_TTL_SECONDS },
  };
}

export const readPendingCookie = (token: string | undefined) => verify<PendingSignIn>(token, "circuit-oauth-pending");

/** Where a failed attempt lands: back on the page it started from. */
export function oauthErrorPath(from: FlowState["from"], error: string, next: string): string {
  if (from === "account") return `/account?google=${error}`;
  return `/${from}?error=${error}${next !== "/" ? `&next=${encodeURIComponent(next)}` : ""}`;
}

export const clearedCookie = (name: string, path = "/") => ({
  name,
  value: "",
  options: { httpOnly: true, sameSite: "lax" as const, secure, path, maxAge: 0 },
});
