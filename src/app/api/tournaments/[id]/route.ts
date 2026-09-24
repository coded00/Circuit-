/**
 * Circuit — tournament edit (Build Plan P1-3, maps: TRN-4).
 *
 * Editable up until registration closes. entryFee and prizeAmount lock
 * the moment a paid registration exists — everything else stays editable
 * throughout, matching TRN-4's own scope (it's specifically those two
 * money-shaped fields that lock, not the whole tournament).
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { parseOptionalUrl, parseOptionalImageUrl } from "@/lib/validation";
import { logAdminAction } from "@/lib/auditLog";
import { ALL_TEAM_SIZE_VALUES } from "@/lib/gameFormats";

const MAX_PARTICIPANT_CAP = 128;

function parseDate(value: unknown): Date | null | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  }

  const { id } = await params;
  const tournament = await prisma.tournament.findUnique({ where: { id } });
  if (!tournament) {
    return NextResponse.json({ error: "Tournament not found." }, { status: 404 });
  }
  if (tournament.organizerId !== user.id && !user.isStaff) {
    return NextResponse.json({ error: "Only the organizer can edit this tournament." }, { status: 403 });
  }
  if (new Date() >= tournament.registrationCloseAt) {
    return NextResponse.json(
      { error: "This tournament can no longer be edited — registration has closed." },
      { status: 409 }
    );
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const hasPaidRegistration =
    tournament.entryFee > 0 &&
    (await prisma.registration.count({ where: { tournamentId: id, status: "CONFIRMED" } })) > 0;

  if (hasPaidRegistration && (body.entryFee !== undefined || body.prizeAmount !== undefined)) {
    return NextResponse.json(
      {
        error:
          "Entry fee and prize amount are locked — a paid registration already exists for this tournament.",
      },
      { status: 409 }
    );
  }

  const data: Record<string, unknown> = {};

  if (body.name !== undefined) {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) return NextResponse.json({ error: "Name can't be empty." }, { status: 400 });
    data.name = name;
  }
  if (body.game !== undefined) {
    const game = typeof body.game === "string" ? body.game.trim() : "";
    if (!game) return NextResponse.json({ error: "Game can't be empty." }, { status: 400 });
    data.game = game;
  }
  if (body.teamSize !== undefined) {
    const teamSize = typeof body.teamSize === "string" ? body.teamSize.trim() : "";
    if (!ALL_TEAM_SIZE_VALUES.includes(teamSize)) {
      return NextResponse.json(
        { error: "Game mode isn't a recognized option for this game." },
        { status: 400 }
      );
    }
    data.teamSize = teamSize;
  }
  if (body.rulesText !== undefined) {
    const rulesText = typeof body.rulesText === "string" ? body.rulesText.trim() : "";
    if (!rulesText) return NextResponse.json({ error: "Rules can't be empty." }, { status: 400 });
    data.rulesText = rulesText;
  }
  if (body.participantCap !== undefined) {
    const participantCap = Number(body.participantCap);
    if (!Number.isInteger(participantCap) || participantCap < 2 || participantCap > MAX_PARTICIPANT_CAP) {
      return NextResponse.json(
        { error: `Participant cap must be a whole number between 2 and ${MAX_PARTICIPANT_CAP}.` },
        { status: 400 }
      );
    }
    data.participantCap = participantCap;
  }
  if (body.entryFee !== undefined) {
    const entryFee = Number(body.entryFee);
    if (!Number.isInteger(entryFee) || entryFee < 0) {
      return NextResponse.json({ error: "Entry fee must be a whole number of kobo, 0 or more." }, { status: 400 });
    }
    data.entryFee = entryFee;
  }
  if (body.prizeAmount !== undefined) {
    const prizeAmount = body.prizeAmount === null || body.prizeAmount === "" ? null : Number(body.prizeAmount);
    if (prizeAmount !== null && (!Number.isInteger(prizeAmount) || prizeAmount < 0)) {
      return NextResponse.json(
        { error: "Prize amount must be a whole number of kobo, 0 or more." },
        { status: 400 }
      );
    }
    data.prizeAmount = prizeAmount;
  }
  if (body.prizeText !== undefined) {
    data.prizeText = typeof body.prizeText === "string" && body.prizeText.trim() ? body.prizeText.trim() : null;
  }
  if (body.streamUrl !== undefined) {
    const streamUrlResult = parseOptionalUrl(body.streamUrl);
    if (!streamUrlResult.ok) {
      return NextResponse.json({ error: "Stream link must be a valid http(s) URL." }, { status: 400 });
    }
    data.streamUrl = streamUrlResult.url;
  }
  if (body.posterUrl !== undefined) {
    const posterUrlResult = parseOptionalImageUrl(body.posterUrl);
    if (!posterUrlResult.ok) {
      return NextResponse.json({ error: "Poster link must be a valid http(s) URL." }, { status: 400 });
    }
    data.posterUrl = posterUrlResult.url;
  }

  const registrationOpenAt = parseDate(body.registrationOpenAt);
  const registrationCloseAt = parseDate(body.registrationCloseAt);
  const startAt = parseDate(body.startAt);
  if (registrationOpenAt === null || registrationCloseAt === null || startAt === null) {
    return NextResponse.json({ error: "Dates must all be valid." }, { status: 400 });
  }
  const nextOpenAt = registrationOpenAt ?? tournament.registrationOpenAt;
  const nextCloseAt = registrationCloseAt ?? tournament.registrationCloseAt;
  const nextStartAt = startAt ?? tournament.startAt;
  if (nextOpenAt >= nextCloseAt) {
    return NextResponse.json({ error: "Registration must open before it closes." }, { status: 400 });
  }
  if (nextCloseAt > nextStartAt) {
    return NextResponse.json(
      { error: "Registration must close at or before the start date." },
      { status: 400 }
    );
  }
  if (registrationOpenAt !== undefined) data.registrationOpenAt = registrationOpenAt;
  if (registrationCloseAt !== undefined) data.registrationCloseAt = registrationCloseAt;
  if (startAt !== undefined) data.startAt = startAt;

  const updated = await prisma.tournament.update({ where: { id }, data });

  if (user.isStaff && tournament.organizerId !== user.id) {
    await logAdminAction({
      actorId: user.id,
      action: "tournament.edit",
      targetType: "Tournament",
      targetId: id,
      metadata: { fields: Object.keys(data) },
    });
  }

  return NextResponse.json({ id: updated.id });
}
