/**
 * Circuit — Google sign-in (OpenID Connect, authorization code flow with
 * PKCE). Server-side only: the client secret, the code exchange and the
 * ID-token check never touch the browser.
 *
 * Config comes from the environment:
 *   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET — the Google Cloud OAuth client
 *   NEXT_PUBLIC_APP_URL                    — the redirect URI is derived
 *     from it (`<app url>/api/auth/google/callback`), so dev and prod each
 *     register their own callback and nothing is hardcoded.
 * Without the two Google vars, Google sign-in reports itself unavailable
 * and the buttons are hidden.
 *
 * GOOGLE_OAUTH_TEST_ISSUER points the whole flow at a local mock OpenID
 * provider for automated tests. It is ignored in production builds.
 *
 * No Google tokens are kept: the ID token is verified once (signature via
 * Google's JWKS, issuer, audience, expiry, nonce) and only its identity
 * claims are used.
 */

import { createHash, randomBytes } from "crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { SITE_URL } from "@/lib/seo";

type Endpoints = { authUrl: string; tokenUrl: string; jwksUrl: string; issuers: string[] };

const GOOGLE_ENDPOINTS: Endpoints = {
  authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
  tokenUrl: "https://oauth2.googleapis.com/token",
  jwksUrl: "https://www.googleapis.com/oauth2/v3/certs",
  issuers: ["https://accounts.google.com", "accounts.google.com"],
};

export type GoogleConfig = { clientId: string; clientSecret: string; redirectUri: string; endpoints: Endpoints };

function endpoints(): Endpoints {
  const testIssuer = process.env.NODE_ENV !== "production" ? process.env.GOOGLE_OAUTH_TEST_ISSUER : undefined;
  if (!testIssuer) return GOOGLE_ENDPOINTS;
  const base = testIssuer.replace(/\/$/, "");
  return { authUrl: `${base}/authorize`, tokenUrl: `${base}/token`, jwksUrl: `${base}/jwks`, issuers: [base] };
}

export function getGoogleConfig(): GoogleConfig | null {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret, redirectUri: `${SITE_URL}/api/auth/google/callback`, endpoints: endpoints() };
}

export function isGoogleSignInEnabled(): boolean {
  return getGoogleConfig() !== null;
}

const base64url = (buf: Buffer) => buf.toString("base64url");

/** Fresh per-attempt secrets: CSRF `state`, PKCE verifier, ID-token `nonce`. */
export function createAuthSecrets() {
  return { state: base64url(randomBytes(24)), codeVerifier: base64url(randomBytes(32)), nonce: base64url(randomBytes(24)) };
}

export function buildAuthorizationUrl(config: GoogleConfig, secrets: ReturnType<typeof createAuthSecrets>, opts: { selectAccount?: boolean } = {}) {
  const url = new URL(config.endpoints.authUrl);
  url.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state: secrets.state,
    nonce: secrets.nonce,
    code_challenge: base64url(createHash("sha256").update(secrets.codeVerifier).digest()),
    code_challenge_method: "S256",
    ...(opts.selectAccount ? { prompt: "select_account" } : {}),
  }).toString();
  return url.toString();
}

export type GoogleProfile = {
  /** Google's stable account id. */
  sub: string;
  email: string;
  name: string | null;
  picture: string | null;
};

export class GoogleAuthError extends Error {
  constructor(public code: "network" | "exchange" | "invalid_token" | "unverified_email") {
    super(code);
    this.name = "GoogleAuthError";
  }
}

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();
function jwks(url: string) {
  let set = jwksCache.get(url);
  if (!set) {
    set = createRemoteJWKSet(new URL(url));
    jwksCache.set(url, set);
  }
  return set;
}

/** Trades the authorization code for a verified identity. */
export async function exchangeCodeForProfile(config: GoogleConfig, code: string, codeVerifier: string, nonce: string): Promise<GoogleProfile> {
  let res: Response;
  try {
    res = await fetch(config.endpoints.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: config.redirectUri,
        grant_type: "authorization_code",
        code_verifier: codeVerifier,
      }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new GoogleAuthError("network");
  }
  if (!res.ok) throw new GoogleAuthError("exchange");
  const tokens = (await res.json().catch(() => null)) as { id_token?: unknown } | null;
  if (typeof tokens?.id_token !== "string") throw new GoogleAuthError("exchange");

  let claims: Record<string, unknown>;
  try {
    const { payload } = await jwtVerify(tokens.id_token, jwks(config.endpoints.jwksUrl), {
      issuer: config.endpoints.issuers,
      audience: config.clientId,
    });
    claims = payload;
  } catch (err) {
    // A JWKS fetch failure is a network problem, not a bad token.
    if (err instanceof Error && /fetch|network|timeout|ECONN/i.test(err.message)) throw new GoogleAuthError("network");
    throw new GoogleAuthError("invalid_token");
  }
  if (claims.nonce !== nonce || typeof claims.sub !== "string" || typeof claims.email !== "string") {
    throw new GoogleAuthError("invalid_token");
  }
  // Only a Google-verified email may ever match or create a Circuit account.
  if (claims.email_verified !== true && claims.email_verified !== "true") throw new GoogleAuthError("unverified_email");

  return {
    sub: claims.sub,
    email: claims.email.toLowerCase(),
    name: typeof claims.name === "string" && claims.name.trim() ? claims.name.trim().slice(0, 60) : null,
    picture: typeof claims.picture === "string" && claims.picture.startsWith("https://") ? claims.picture : null,
  };
}
