/**
 * Circuit — block and unblock a player (see src/lib/blocks.ts for what a
 * block does). Both take { handle }.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { BlockError, blockUser, unblockUser } from "@/lib/blocks";

async function resolve(request: Request, viewerId: string) {
  const body = await request.json().catch(() => null);
  const handle = typeof body?.handle === "string" ? body.handle.trim().replace(/^@/, "") : "";
  if (!handle) return { error: NextResponse.json({ error: "A player handle is required." }, { status: 400 }) };
  const target = await prisma.user.findUnique({ where: { handle }, select: { id: true, handle: true } });
  if (!target) return { error: NextResponse.json({ error: "Player not found." }, { status: 404 }) };
  if (target.id === viewerId) return { error: NextResponse.json({ error: "You can't block yourself." }, { status: 400 }) };
  return { target };
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  const r = await resolve(request, user.id);
  if (r.error) return r.error;
  try {
    await blockUser(user.id, r.target.id);
  } catch (err) {
    if (err instanceof BlockError) return NextResponse.json({ error: err.message }, { status: err.code === "NOT_FOUND" ? 404 : 400 });
    throw err;
  }
  return NextResponse.json({ ok: true, handle: r.target.handle });
}

export async function DELETE(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  const r = await resolve(request, user.id);
  if (r.error) return r.error;
  await unblockUser(user.id, r.target.id);
  return NextResponse.json({ ok: true, handle: r.target.handle });
}
