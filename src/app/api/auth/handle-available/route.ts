/**
 * Circuit — `GET ?handle=` → `{ available, reason? }` for the signup
 * username step. Handles are public profile names, so checking one leaks
 * nothing; signup still enforces uniqueness on create.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { HANDLE_RULES_MESSAGE, validateHandle } from "@/lib/handles";

export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get("handle") ?? "";
  const handle = validateHandle(raw);
  if (!handle) return NextResponse.json({ available: false, reason: HANDLE_RULES_MESSAGE });
  const taken = await prisma.user.findUnique({ where: { handle }, select: { id: true } });
  return NextResponse.json(taken ? { available: false, reason: "That username is already taken." } : { available: true });
}
