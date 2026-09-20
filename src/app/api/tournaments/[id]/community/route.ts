/**
 * Circuit — organizer toggle for a tournament's Community (Phase 1).
 * "Enable/disable from tournament settings" — the edit form's own toggle
 * posts here; tournament creation creates it inline via the tournaments
 * route instead (see that route's own comment on why: one request, not
 * a create-then-enable round trip).
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { enableCommunity, disableCommunity, CommunityError } from "@/lib/community";

// Same staff-bypass rule as the main tournament PATCH route (see that
// route's own check) — the admin edit page reuses this same EditForm/
// toggle for a staff member editing someone else's tournament.
async function requireOrganizerOrStaff(tournamentId: string, user: { id: string; isStaff: boolean }) {
  const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId }, select: { organizerId: true } });
  if (!tournament) return { error: NextResponse.json({ error: "Tournament not found." }, { status: 404 }) };
  if (tournament.organizerId !== user.id && !user.isStaff) {
    return { error: NextResponse.json({ error: "Only this tournament's organizer can do that." }, { status: 403 }) };
  }
  return { error: null };
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });

  const { id } = await params;
  const { error } = await requireOrganizerOrStaff(id, user);
  if (error) return error;

  const community = await enableCommunity(id);
  return NextResponse.json({ id: community.id, enabled: community.enabled }, { status: 201 });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });

  const { id } = await params;
  const { error } = await requireOrganizerOrStaff(id, user);
  if (error) return error;

  try {
    const community = await disableCommunity(id);
    return NextResponse.json({ id: community.id, enabled: community.enabled });
  } catch (err) {
    if (err instanceof CommunityError) return NextResponse.json({ error: err.message }, { status: 404 });
    throw err;
  }
}
