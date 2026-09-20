/**
 * Circuit — auth primitives (Build Plan task P0-2).
 *
 * Scope on purpose: hashing, session tokens, and cookie config only. Signup
 * forms, login routes, and OAuth providers are separate tasks — this is the
 * shared foundation everything else in P0-2/P0-3/P0-7 sits on.
 *
 * Requirements implemented here: ACC-2 (lightweight signup — no payment or
 * identity fields at account creation), ACC-5 (hashed credentials, session
 * expiry). Rate-limiting login attempts (also ACC-5) belongs in the login
 * route handler, not here — it needs request-level state this module
 * doesn't have.
 */

import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { createHash, randomBytes } from "crypto";

const SESSION_COOKIE_NAME = "circuit_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days — see PRD open question on session length if this needs revisiting.

function getSessionSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error(
      "JWT_SECRET is not set. Copy .env.example to .env and set a real value before running the app."
    );
  }
  return new TextEncoder().encode(secret);
}

// ---------------------------------------------------------------------------
// Password hashing
// ---------------------------------------------------------------------------

const BCRYPT_ROUNDS = 12;

export async function hashPassword(plainPassword: string): Promise<string> {
  return bcrypt.hash(plainPassword, BCRYPT_ROUNDS);
}

// A fixed, validly-formatted bcrypt hash compared against when no real
// user/hash exists — hashed once at module load, same cost factor as a
// real password. Login used to skip bcrypt.compare entirely for an
// unknown identifier, so an unknown-identifier response returned
// measurably faster than a known-identifier-with-wrong-password one,
// enumerating valid accounts despite an identical error message. This
// keeps every login attempt doing the same amount of work either way.
const DUMMY_PASSWORD_HASH = bcrypt.hashSync("circuit-timing-safety-dummy-password", BCRYPT_ROUNDS);

export async function verifyPasswordTimingSafe(
  plainPassword: string,
  passwordHash: string | null | undefined
): Promise<boolean> {
  if (!passwordHash) {
    await bcrypt.compare(plainPassword, DUMMY_PASSWORD_HASH);
    return false;
  }
  return bcrypt.compare(plainPassword, passwordHash);
}

// ---------------------------------------------------------------------------
// Session tokens
// ---------------------------------------------------------------------------

export type SessionPayload = {
  userId: string;
};

/** Issues a signed, expiring session token. Caller sets it as an httpOnly cookie. */
export async function createSessionToken(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(getSessionSecret());
}

/** Verifies a session token. Returns null on any failure (expired, tampered, malformed). */
export async function verifySessionToken(
  token: string
): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSessionSecret());
    if (typeof payload.userId !== "string") return null;
    return { userId: payload.userId };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Password reset tokens
// ---------------------------------------------------------------------------

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

/** Raw token goes in the reset link/email; only its hash is ever persisted
 *  (`PasswordResetToken.tokenHash`) — same "never store the secret itself"
 *  discipline as passwordHash above. */
export function generatePasswordResetToken(): { raw: string; hash: string; expiresAt: Date } {
  const raw = randomBytes(32).toString("hex");
  return { raw, hash: hashPasswordResetToken(raw), expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS) };
}

export function hashPasswordResetToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export const sessionCookie = {
  name: SESSION_COOKIE_NAME,
  maxAge: SESSION_TTL_SECONDS,
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
};
