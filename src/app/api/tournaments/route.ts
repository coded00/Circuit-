/**
 * Circuit — tournament creation (Build Plan P1-1, maps: TRN-1, ACC-4).
 *
 * Any signed-in Player can call this; ACC-4 grants Organizer capabilities
 * automatically (no separate application) by upserting an OrganizerProfile
 * the first time a user creates a tournament. No age gate here — creating a
 * tournament doesn't move money itself (see src/lib/age-gate.ts's own scope
 * note); that's checked at paid registration and payout claim instead.
 */

import { NextResponse, after } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { parseOptionalUrl } from "@/lib/validation";
import { ALL_TEAM_SIZE_VALUES } from "@/lib/gameFormats";
import { notifyAllUsers } from "@/lib/notifications";
import { enableCommunity } from "@/lib/community";

const MAX_PARTICIPANT_CAP = 128; // D2: V1 bracket ceiling.

function parseDate(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: "You must be signed in to create a tournament." },
      { status: 401 }
    );
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const game = typeof body.game === "string" ? body.game.trim() : "";
  const teamSize = typeof body.teamSize === "string" ? body.teamSize.trim() : "1v1";
  const rulesText = typeof body.rulesText === "string" ? body.rulesText.trim() : "";
  const participantCap = Number(body.participantCap);
  const entryFee = Number(body.entryFee);
  const prizeAmount =
    body.prizeAmount === null || body.prizeAmount === undefined || body.prizeAmount === ""
      ? null
      : Number(body.prizeAmount);
  const prizeText =
    typeof body.prizeText === "string" && body.prizeText.trim() ? body.prizeText.trim() : null;
  const registrationOpenAt = parseDate(body.registrationOpenAt);
  const registrationCloseAt = parseDate(body.registrationCloseAt);
  const startAt = parseDate(body.startAt);
  const streamUrlResult = parseOptionalUrl(body.streamUrl);
  const posterUrlResult = parseOptionalUrl(body.posterUrl);

  // TRN-1: all fields required except prize info.
  if (!name || !game || !rulesText) {
    return NextResponse.json(
      { error: "Name, game, and rules are required." },
      { status: 400 }
    );
  }
  if (!ALL_TEAM_SIZE_VALUES.includes(teamSize)) {
    return NextResponse.json(
      { error: "Game mode isn't a recognized option for this game." },
      { status: 400 }
    );
  }
  if (!Number.isInteger(participantCap) || participantCap < 2 || participantCap > MAX_PARTICIPANT_CAP) {
    return NextResponse.json(
      { error: `Participant cap must be a whole number between 2 and ${MAX_PARTICIPANT_CAP}.` },
      { status: 400 }
    );
  }
  if (!Number.isInteger(entryFee) || entryFee < 0) {
    return NextResponse.json(
      { error: "Entry fee must be a whole number of kobo, 0 or more." },
      { status: 400 }
    );
  }
  if (prizeAmount !== null && (!Number.isInteger(prizeAmount) || prizeAmount < 0)) {
    return NextResponse.json(
      { error: "Prize amount must be a whole number of kobo, 0 or more." },
      { status: 400 }
    );
  }
  if (!registrationOpenAt || !registrationCloseAt || !startAt) {
    return NextResponse.json(
      { error: "Registration open, registration close, and start dates must all be valid." },
      { status: 400 }
    );
  }
  // TRN-1: form validates dates are logically ordered.
  if (registrationOpenAt >= registrationCloseAt) {
    return NextResponse.json(
      { error: "Registration must open before it closes." },
      { status: 400 }
    );
  }
  if (registrationCloseAt > startAt) {
    return NextResponse.json(
      { error: "Registration must close at or before the start date." },
      { status: 400 }
    );
  }
  if (!streamUrlResult.ok) {
    return NextResponse.json(
      { error: "Stream link must be a valid http(s) URL." },
      { status: 400 }
    );
  }
  if (!posterUrlResult.ok) {
    return NextResponse.json(
      { error: "Poster link must be a valid http(s) URL." },
      { status: 400 }
    );
  }

  const organizerProfile = await prisma.organizerProfile.upsert({
    where: { userId: user.id },
    update: {},
    create: { userId: user.id },
  });

  const status = registrationOpenAt <= new Date() ? "OPEN" : "DRAFT";

  const tournament = await prisma.tournament.create({
    data: {
      organizerId: organizerProfile.userId,
      name,
      game,
      teamSize,
      rulesText,
      participantCap,
      entryFee,
      prizeAmount,
      prizeText,
      registrationOpenAt,
      registrationCloseAt,
      startAt,
      streamUrl: streamUrlResult.url,
      posterUrl: posterUrlResult.url,
      status,
    },
  });

  // "Community toggle during tournament creation" (Circuit Community
  // Phase 1) — one request, not a create-then-enable round trip. Default
  // true: maximizes how many tournaments actually get a community during
  // the phase this whole feature exists to answer ("will people talk
  // around a Circuit tournament?"), while still respecting an explicit
  // opt-out.
  if (body.enableCommunity !== false) {
    await enableCommunity(tournament.id);
  }

  // Deferred via after() so the mass fan-out (every user, potentially a
  // real batch of emails/push) never blocks the organizer's own response —
  // see notifyAllUsers's own comment on why this isn't a per-user loop.
  // Fires regardless of DRAFT/OPEN status: a DRAFT tournament (registration
  // not open yet) is already surfaced as real "Announced" content elsewhere
  // (UpcomingCompetitions), so announcing it now is consistent, not premature.
  after(() => notifyAllUsers("NEW_TOURNAMENT", { tournamentId: tournament.id, name: tournament.name }));

  return NextResponse.json({ id: tournament.id }, { status: 201 });
}
