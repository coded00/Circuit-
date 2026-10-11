/**
 * Circuit — lift a player's self-exclusion early. Staff only.
 *
 * The asymmetry is the whole point of the feature: a player can extend their
 * own cool-off as often as they like and cannot shorten it, so the only way
 * out is asking someone. That request arrives at support, not in the app, so
 * there is no player-facing path to this — `POST /api/account/self-exclusion`
 * has no counterpart that ends one.
 *
 * DELETE rather than PATCH — the state being removed is the exclusion itself,
 * and there is no "set someone else's cool-off for them" operation to share
 * the verb with. Every lift is recorded, with the reason, because "we let
 * this player stake again a day after they asked us not to" is exactly the
 * decision that has to be answerable later.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireStaff } from "@/lib/session";
import { logAdminAction } from "@/lib/auditLog";
import { isSelfExcluded } from "@/lib/selfExclusion";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const staffAuth = await requireStaff();
  if (staffAuth.error) return staffAuth.error;
  const admin = staffAuth.user;

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const reason = body && typeof body === "object" && typeof (body as { reason?: unknown }).reason === "string"
    ? (body as { reason: string }).reason.trim()
    : "";

  const target = await prisma.user.findUnique({
    where: { id },
    select: { selfExcludedUntil: true, selfExcludedAt: true },
  });
  if (!target) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  // Only a cool-off that is actually running can be lifted. An expired one is
  // already over, and clearing the dates would erase the record that it
  // happened — the row is the history, so it stays.
  if (!isSelfExcluded(target.selfExcludedUntil)) {
    return NextResponse.json({ error: "That player has no cool-off in force." }, { status: 409 });
  }

  await prisma.user.update({ where: { id }, data: { selfExcludedUntil: null } });

  await logAdminAction({
    actorId: admin.id,
    action: "user.selfExclusionLift",
    targetType: "User",
    targetId: id,
    metadata: {
      reason: reason || null,
      // What was lifted, not just that something was — the end date is the
      // fact a later review would want and nothing else records it.
      wasUntil: target.selfExcludedUntil!.toISOString(),
      wasSince: target.selfExcludedAt?.toISOString() ?? null,
    },
  });

  return NextResponse.json({ selfExcludedUntil: null });
}
