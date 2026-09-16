/**
 * Circuit — edit a Team's name/tag, or disband it. Disbanding deletes
 * every `TeamMembership` row too (`onDelete: Cascade` on that model's
 * `team` relation) — see the captain-leaves-by-disbanding note on
 * `Team`'s own schema comment.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  }

  const { id } = await params;
  const team = await prisma.team.findUnique({ where: { id } });
  if (!team) return NextResponse.json({ error: "Team not found." }, { status: 404 });
  if (team.captainId !== user.id) {
    return NextResponse.json({ error: "Only the captain can edit this team." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  if (typeof body.name === "string") {
    const name = body.name.trim();
    if (!name) return NextResponse.json({ error: "Name is required." }, { status: 400 });
    if (name !== team.name) {
      const clash = await prisma.team.findUnique({ where: { name } });
      if (clash) return NextResponse.json({ error: "A team with that name already exists." }, { status: 409 });
    }
    data.name = name;
  }
  if (body.tag !== undefined) data.tag = typeof body.tag === "string" ? body.tag.trim() || null : null;
  if (body.game !== undefined) data.game = typeof body.game === "string" ? body.game.trim() || null : null;
  if (body.region !== undefined) data.region = typeof body.region === "string" ? body.region.trim() || null : null;

  const updated = await prisma.team.update({ where: { id }, data });
  return NextResponse.json({ id: updated.id });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  }

  const { id } = await params;
  const team = await prisma.team.findUnique({ where: { id } });
  if (!team) return NextResponse.json({ error: "Team not found." }, { status: 404 });
  if (team.captainId !== user.id) {
    return NextResponse.json({ error: "Only the captain can disband this team." }, { status: 403 });
  }

  await prisma.team.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
