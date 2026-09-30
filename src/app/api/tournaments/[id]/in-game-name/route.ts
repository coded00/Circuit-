/**
 * Circuit — is this in-game name still free in the tournament? Powers the
 * live check on the registration form. Advisory only: registering runs the
 * real (locked) check again (src/lib/inGameNames.ts).
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { normalizeInGameName, takenInGameNames } from "@/lib/inGameNames";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { id } = await params;
  const name = new URL(request.url).searchParams.get("name") ?? "";
  const key = normalizeInGameName(name);
  if (!key) return NextResponse.json({ available: false });

  const taken = await takenInGameNames(prisma, id, user.id);
  return NextResponse.json({ available: !taken.has(key) });
}
