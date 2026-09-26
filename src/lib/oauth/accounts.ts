/**
 * Circuit — turning a verified social identity into exactly one Circuit
 * account. One person = one User, however they sign in:
 *
 * 1. Identity already linked → sign in as that User.
 * 2. Otherwise, a User whose email matches the (provider-verified) email
 *    → "link": they must confirm that account's password once. Circuit
 *    never verified who registered an email, so linking silently would let
 *    someone who pre-registered another person's address share their
 *    account (pre-account takeover). The confirm step proves they own both.
 * 3. Otherwise → a new User, created only after onboarding (username etc.).
 *
 * Nothing here overwrites an existing account's profile: Google's name
 * and picture are only used to prefill a brand-new account.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { joinGlobalCommunity } from "@/lib/community";
import { handleFromName, validateHandle } from "@/lib/handles";
import type { GoogleProfile } from "./google";

export const PROVIDER_GOOGLE = "google";

export type SignInResolution =
  | { type: "existing"; userId: string }
  | { type: "link"; userId: string }
  /** The email belongs to an account with no password — i.e. one already
   *  signed in with a *different* Google account. Can't be linked here. */
  | { type: "conflict" }
  | { type: "new" };

/** Case-insensitive match on the account's email or email-style login. */
export function findUserByEmail(email: string) {
  return prisma.user.findFirst({
    where: {
      OR: [{ email: { equals: email, mode: "insensitive" } }, { emailOrPhone: { equals: email, mode: "insensitive" } }],
    },
    orderBy: { createdAt: "asc" },
    select: { id: true, handle: true, passwordHash: true, emailOrPhone: true },
  });
}

export async function resolveGoogleSignIn(profile: GoogleProfile): Promise<SignInResolution> {
  const identity = await prisma.authIdentity.findUnique({
    where: { provider_providerAccountId: { provider: PROVIDER_GOOGLE, providerAccountId: profile.sub } },
  });
  if (identity) {
    await prisma.authIdentity.update({ where: { id: identity.id }, data: { lastUsedAt: new Date(), email: profile.email } });
    return { type: "existing", userId: identity.userId };
  }

  const existing = await findUserByEmail(profile.email);
  if (existing) return existing.passwordHash ? { type: "link", userId: existing.id } : { type: "conflict" };
  return { type: "new" };
}

export class IdentityConflictError extends Error {
  constructor(public code: "taken" | "already_linked") {
    super(code);
    this.name = "IdentityConflictError";
  }
}

/** Links a Google identity to an existing User. Never touches their profile. */
export async function attachGoogleIdentity(userId: string, profile: GoogleProfile) {
  const [byAccount, byUser] = await Promise.all([
    prisma.authIdentity.findUnique({ where: { provider_providerAccountId: { provider: PROVIDER_GOOGLE, providerAccountId: profile.sub } } }),
    prisma.authIdentity.findUnique({ where: { userId_provider: { userId, provider: PROVIDER_GOOGLE } } }),
  ]);
  if (byAccount && byAccount.userId !== userId) throw new IdentityConflictError("taken");
  if (byAccount) return byAccount;
  if (byUser) throw new IdentityConflictError("already_linked");

  try {
    const created = await prisma.authIdentity.create({
      data: { userId, provider: PROVIDER_GOOGLE, providerAccountId: profile.sub, email: profile.email, lastUsedAt: new Date() },
    });
    // Record the verified email if the account doesn't have one yet (and
    // nobody else claims it) — but never replace an email they set.
    await prisma.user
      .updateMany({ where: { id: userId, email: null }, data: { email: profile.email } })
      .catch(() => undefined);
    return created;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") throw new IdentityConflictError("taken");
    throw err;
  }
}

/** First free username based on the Google name/email, for prefilling. */
export async function suggestHandle(profile: GoogleProfile): Promise<string> {
  const base = handleFromName(profile.name ?? profile.email);
  const candidates = [base, ...Array.from({ length: 8 }, () => `${base.slice(0, 16)}${Math.floor(10 + Math.random() * 9990)}`)];
  const taken = new Set(
    (await prisma.user.findMany({ where: { handle: { in: candidates } }, select: { handle: true } })).map((u) => u.handle)
  );
  return candidates.find((c) => validateHandle(c) && !taken.has(c)) ?? `${base.slice(0, 12)}_${Date.now() % 100000}`;
}

export type NewGoogleUserInput = {
  handle: string;
  displayName: string;
  region: string | null;
  favoriteGames: string[];
  useGooglePhoto: boolean;
};

export class NewAccountError extends Error {
  constructor(public code: "handle_taken" | "email_taken" | "identity_taken") {
    super(code);
    this.name = "NewAccountError";
  }
}

/** Creates the User and its Google identity together, so neither can exist without the other. */
export async function createGoogleUser(profile: GoogleProfile, input: NewGoogleUserInput) {
  // Re-checked here, not just when the flow started: an email account
  // could have been registered in the meantime.
  if (await findUserByEmail(profile.email)) throw new NewAccountError("email_taken");

  try {
    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          handle: input.handle,
          displayName: input.displayName,
          emailOrPhone: profile.email,
          email: profile.email,
          passwordHash: null,
          avatarUrl: input.useGooglePhoto ? profile.picture : null,
          region: input.region,
          favoriteGames: input.favoriteGames,
        },
      });
      await tx.authIdentity.create({
        data: { userId: created.id, provider: PROVIDER_GOOGLE, providerAccountId: profile.sub, email: profile.email, lastUsedAt: new Date() },
      });
      return created;
    });
    await joinGlobalCommunity(user.id);
    return user;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const target = (err.meta?.target as string[] | undefined) ?? [];
      if (target.includes("handle")) throw new NewAccountError("handle_taken");
      if (target.includes("providerAccountId")) throw new NewAccountError("identity_taken");
      throw new NewAccountError("email_taken");
    }
    throw err;
  }
}
