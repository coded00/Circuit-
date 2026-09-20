/**
 * Circuit — profile view/edit (Build Plan P0-7, maps: ACC-6).
 *
 * displayName/avatarUrl are cosmetic; payoutMethodRef is what REG-6/P2-6's
 * payout actually pays out to; dateOfBirth is what ACC-3's age gate reads —
 * nothing else in the app ever wrote it before this route existed.
 */

import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { parseOptionalUrl, parseOptionalEmail } from "@/lib/validation";

const MIN_AGE_PLAUSIBLE_YEARS = 130;

export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const MAX_FAVORITE_GAMES = 6;
  const MAX_BIO_LENGTH = 160;
  const MAX_REGION_LENGTH = 60;

  const data: {
    displayName?: string;
    avatarUrl?: string | null;
    payoutMethodRef?: string | null;
    dateOfBirth?: Date | null;
    bio?: string | null;
    favoriteGames?: string[];
    email?: string | null;
    notifyNewContent?: boolean;
    oneSignalPlayerId?: string | null;
    region?: string | null;
  } = {};

  if (body.displayName !== undefined) {
    const displayName = typeof body.displayName === "string" ? body.displayName.trim() : "";
    if (!displayName) {
      return NextResponse.json({ error: "Display name can't be empty." }, { status: 400 });
    }
    data.displayName = displayName;
  }

  if (body.bio !== undefined) {
    const bio = typeof body.bio === "string" ? body.bio.trim() : "";
    if (bio.length > MAX_BIO_LENGTH) {
      return NextResponse.json({ error: `Bio must be ${MAX_BIO_LENGTH} characters or fewer.` }, { status: 400 });
    }
    data.bio = bio || null;
  }

  if (body.favoriteGames !== undefined) {
    if (!Array.isArray(body.favoriteGames) || body.favoriteGames.some((g: unknown) => typeof g !== "string")) {
      return NextResponse.json({ error: "Favorite games must be a list of names." }, { status: 400 });
    }
    const games: string[] = [...new Set((body.favoriteGames as string[]).map((g) => g.trim()).filter(Boolean))];
    if (games.length > MAX_FAVORITE_GAMES) {
      return NextResponse.json({ error: `Pick up to ${MAX_FAVORITE_GAMES} games.` }, { status: 400 });
    }
    data.favoriteGames = games;
  }

  if (body.avatarUrl !== undefined) {
    const avatarUrlResult = parseOptionalUrl(body.avatarUrl);
    if (!avatarUrlResult.ok) {
      return NextResponse.json({ error: "Avatar must be a valid http(s) URL." }, { status: 400 });
    }
    data.avatarUrl = avatarUrlResult.url;
  }

  if (body.payoutMethodRef !== undefined) {
    const ref = typeof body.payoutMethodRef === "string" ? body.payoutMethodRef.trim() : "";
    // Real payout destinations only ever come from /api/payments/resolve-
    // account, which verifies the bank account with Paystack first and
    // returns their own RCP_... recipient code (src/lib/payments/
    // paystack.ts's createTransferRecipient) — never typed by hand. This
    // format check is what actually enforces that invariant server-side;
    // the account page used to expose a raw text input that could set
    // this to anything, bypassing verification entirely. Underscores are
    // allowed (not just alphanumeric) so this still accepts the dev-mode
    // simulated code (RCP_sim_..., resolve-account/route.ts's own
    // fallback when PAYSTACK_SECRET_KEY is unset).
    if (ref && !/^RCP_[A-Za-z0-9_]+$/.test(ref)) {
      return NextResponse.json(
        { error: "Invalid payout method. Link a bank account instead of setting this directly." },
        { status: 400 }
      );
    }
    data.payoutMethodRef = ref || null;
  }

  if (body.dateOfBirth !== undefined) {
    if (body.dateOfBirth === null || body.dateOfBirth === "") {
      data.dateOfBirth = null;
    } else {
      const dob = new Date(body.dateOfBirth);
      const now = new Date();
      if (
        typeof body.dateOfBirth !== "string" ||
        Number.isNaN(dob.getTime()) ||
        dob > now ||
        dob < new Date(now.getFullYear() - MIN_AGE_PLAUSIBLE_YEARS, now.getMonth(), now.getDate())
      ) {
        return NextResponse.json({ error: "Date of birth isn't valid." }, { status: 400 });
      }
      data.dateOfBirth = dob;
    }
  }

  if (body.email !== undefined) {
    const emailResult = parseOptionalEmail(body.email);
    if (!emailResult.ok) {
      return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    }
    data.email = emailResult.email;
  }

  if (body.notifyNewContent !== undefined) {
    data.notifyNewContent = Boolean(body.notifyNewContent);
  }

  // Written by OneSignalInit.tsx once a browser actually subscribes — not
  // user-facing in the form, just a background sync call.
  if (body.oneSignalPlayerId !== undefined) {
    data.oneSignalPlayerId = typeof body.oneSignalPlayerId === "string" ? body.oneSignalPlayerId : null;
  }

  if (body.region !== undefined) {
    const region = typeof body.region === "string" ? body.region.trim() : "";
    if (region.length > MAX_REGION_LENGTH) {
      return NextResponse.json({ error: `Region must be ${MAX_REGION_LENGTH} characters or fewer.` }, { status: 400 });
    }
    data.region = region || null;
  }

  let updated;
  try {
    updated = await prisma.user.update({ where: { id: user.id }, data });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json({ error: "That email is already in use." }, { status: 409 });
    }
    throw err;
  }

  return NextResponse.json({
    displayName: updated.displayName,
    handle: updated.handle,
    avatarUrl: updated.avatarUrl,
    payoutMethodRef: updated.payoutMethodRef,
    dateOfBirth: updated.dateOfBirth,
    bio: updated.bio,
    favoriteGames: updated.favoriteGames,
    email: updated.email,
    notifyNewContent: updated.notifyNewContent,
    region: updated.region,
  });
}
