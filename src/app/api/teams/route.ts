/**
 * Circuit — create a Team. See that model's own schema comment: a
 * persistent squad, not a tournament/challenge registration unit.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const tag = typeof body?.tag === "string" ? body.tag.trim() || null : null;
  if (!name) {
    return NextResponse.json({ error: "Team name is required." }, { status: 400 });
  }

  const existing = await prisma.team.findUnique({ where: { name } });
  if (existing) {
    return NextResponse.json({ error: "A team with that name already exists." }, { status: 409 });
  }

  const team = await prisma.$transaction(async (tx) => {
    const created = await tx.team.create({ data: { name, tag, captainId: user.id } });
    await tx.teamMembership.create({ data: { teamId: created.id, userId: user.id, accepted: true } });
    return created;
  });

  return NextResponse.json({ id: team.id }, { status: 201 });
}
