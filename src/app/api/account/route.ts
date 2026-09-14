/**
 * Circuit — profile view/edit (Build Plan P0-7, maps: ACC-6).
 *
 * displayName/avatarUrl are cosmetic; payoutMethodRef is what REG-6/P2-6's
 * payout actually pays out to; dateOfBirth is what ACC-3's age gate reads —
 * nothing else in the app ever wrote it before this route existed.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { parseOptionalUrl } from "@/lib/validation";

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

  const data: {
    displayName?: string;
    avatarUrl?: string | null;
    payoutMethodRef?: string | null;
    dateOfBirth?: Date | null;
    bio?: string | null;
    favoriteGames?: string[];
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

  const updated = await prisma.user.update({ where: { id: user.id }, data });

  return NextResponse.json({
    displayName: updated.displayName,
    handle: updated.handle,
    avatarUrl: updated.avatarUrl,
    payoutMethodRef: updated.payoutMethodRef,
    dateOfBirth: updated.dateOfBirth,
    bio: updated.bio,
    favoriteGames: updated.favoriteGames,
  });
}
