/**
 * Circuit — tournament edit (Build Plan P1-3, maps: TRN-4).
 *
 * Editable up until registration closes. entryFee and prizeAmount lock
 * the moment a paid registration exists, and the game/mode/format lock
 * the moment anyone has registered (they signed up for that competition)
 * — everything else stays editable throughout.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser, suspendedResponse } from "@/lib/session";
import { parseOptionalUrl, parseOptionalImageUrl } from "@/lib/validation";
import { logAdminAction } from "@/lib/auditLog";
import { entriesPerMatch } from "@/lib/gameCatalog";
import { parseLobbyGroups, parseLobbyRounds } from "@/lib/lobbyScoring";
import { parseLeagueSettings } from "@/lib/leagueTable";
import { getStructure } from "@/lib/competitionStructures";
import { maxPrizePlaces, parsePrizeSplit } from "@/lib/prizes";
import { resolveCompetition } from "@/lib/competitionConfig";
import { prizeFundingError } from "@/lib/prizePool";

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
  const suspended = suspendedResponse(user);
  if (suspended) return suspended;

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
      { error: "This tournament can no longer be edited. Registration has closed." },
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
          "Entry fee and prize amount are locked. A paid registration already exists for this tournament.",
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
  let lobbyCapacity: number | null = null;
  const changesCompetition =
    body.gameFormatId !== undefined &&
    (body.gameFormatId !== tournament.gameFormatId || body.structure !== tournament.format || body.gameId !== tournament.gameId);
  if (changesCompetition) {
    const registered = await prisma.registration.count({ where: { tournamentId: id, status: { in: ["PENDING_PAYMENT", "CONFIRMED"] } } });
    if (registered > 0) {
      return NextResponse.json({ error: "The game and format are locked. Players have already registered for this tournament." }, { status: 409 });
    }
    const competition = await resolveCompetition(body);
    if (!competition.ok) return NextResponse.json({ error: competition.error }, { status: 400 });
    Object.assign(data, competition.fields);
    lobbyCapacity = competition.lobbyCapacity;
    if (competition.fields.competitionStyle !== "LOBBY") data.lobbyRounds = null;
  } else if (tournament.competitionStyle === "LOBBY" && tournament.gameFormatId) {
    const format = await prisma.gameFormat.findUnique({ where: { id: tournament.gameFormatId } });
    lobbyCapacity = format ? entriesPerMatch(format) : null;
  }
  const style = (data.competitionStyle as string | undefined) ?? tournament.competitionStyle;
  if (style === "LOBBY" && (body.lobbyRounds !== undefined || changesCompetition)) {
    if (tournament.status === "LIVE" || tournament.status === "COMPLETE") {
      if (body.lobbyRounds !== undefined && Number(body.lobbyRounds) !== tournament.lobbyRounds) {
        return NextResponse.json({ error: "The number of rounds is locked once the lobby has started." }, { status: 409 });
      }
    } else {
      const rounds = parseLobbyRounds(body.lobbyRounds ?? tournament.lobbyRounds);
      if (!rounds.ok) return NextResponse.json({ error: rounds.error }, { status: 400 });
      data.lobbyRounds = rounds.value;
    }
  }
  // League settings: fixed once the league has started. Changing to or from a league resets them.
  const structureNow = (data.format as string | undefined) ?? tournament.format;
  if (structureNow !== "LEAGUE") {
    if (tournament.format === "LEAGUE") Object.assign(data, { leagueWinPoints: null, leagueDrawPoints: null, leagueLegs: null, leagueMatchdayDays: null });
  } else {
    const touched = ["leagueWinPoints", "leagueDrawPoints", "leagueAllowDraws", "leagueLegs", "leagueMatchdayDays"].some((k) => body[k] !== undefined);
    if (touched || changesCompetition) {
      const current = {
        winPoints: tournament.leagueWinPoints ?? 3,
        drawPoints: tournament.leagueDrawPoints,
        legs: tournament.leagueLegs ?? 1,
        matchdayDays: tournament.leagueMatchdayDays ?? 7,
      };
      const league = parseLeagueSettings({
        winPoints: body.leagueWinPoints ?? current.winPoints,
        drawPoints: body.leagueDrawPoints ?? current.drawPoints ?? undefined,
        allowDraws: body.leagueAllowDraws ?? (tournament.format === "LEAGUE" ? current.drawPoints !== null : true),
        legs: body.leagueLegs ?? current.legs,
        matchdayDays: body.leagueMatchdayDays ?? current.matchdayDays,
      });
      if (!league.ok) return NextResponse.json({ error: league.error }, { status: 400 });
      const same =
        tournament.format === "LEAGUE" &&
        league.value.winPoints === current.winPoints &&
        league.value.drawPoints === current.drawPoints &&
        league.value.legs === current.legs &&
        league.value.matchdayDays === current.matchdayDays;
      if (!same) {
        const registered = await prisma.registration.count({ where: { tournamentId: id, status: { in: ["PENDING_PAYMENT", "CONFIRMED"] } } });
        if (registered > 0 || tournament.status === "LIVE" || tournament.status === "COMPLETE") {
          return NextResponse.json({ error: "The league's points and schedule are locked once players have registered." }, { status: 409 });
        }
      }
      Object.assign(data, { leagueWinPoints: league.value.winPoints, leagueDrawPoints: league.value.drawPoints, leagueLegs: league.value.legs, leagueMatchdayDays: league.value.matchdayDays });
    }
  }
  // Groups, then a final: fixed once the lobby has started.
  let groupCount = style === "LOBBY" ? Math.max(1, tournament.lobbyGroups ?? 1) : 1;
  let finalists = style === "LOBBY" && tournament.lobbyGroups && tournament.lobbyQualifiers ? tournament.lobbyGroups * tournament.lobbyQualifiers : null;
  if (style !== "LOBBY" && changesCompetition) Object.assign(data, { lobbyGroups: null, lobbyQualifiers: null, lobbyFinalRounds: null });
  if (style === "LOBBY" && (body.lobbyGroups !== undefined || changesCompetition || body.participantCap !== undefined)) {
    const started = tournament.status === "LIVE" || tournament.status === "COMPLETE";
    if (started) {
      if (body.lobbyGroups !== undefined && (Number(body.lobbyGroups) || null) !== tournament.lobbyGroups) {
        return NextResponse.json({ error: "Groups are locked once the lobby has started." }, { status: 409 });
      }
    } else {
      const parsed = parseLobbyGroups(
        {
          groups: body.lobbyGroups !== undefined ? body.lobbyGroups : tournament.lobbyGroups,
          qualifiers: body.lobbyQualifiers !== undefined ? body.lobbyQualifiers : tournament.lobbyQualifiers,
          finalRounds: body.lobbyFinalRounds !== undefined ? body.lobbyFinalRounds : tournament.lobbyFinalRounds,
        },
        lobbyCapacity,
        Number(body.participantCap ?? tournament.participantCap)
      );
      if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
      data.lobbyGroups = parsed.value?.groups ?? null;
      data.lobbyQualifiers = parsed.value?.qualifiers ?? null;
      data.lobbyFinalRounds = parsed.value?.finalRounds ?? null;
      groupCount = parsed.value?.groups ?? 1;
      finalists = parsed.value ? parsed.value.groups * parsed.value.qualifiers : null;
    }
  }
  if (body.rulesText !== undefined) {
    const rulesText = typeof body.rulesText === "string" ? body.rulesText.trim() : "";
    if (!rulesText) return NextResponse.json({ error: "Rules can't be empty." }, { status: 400 });
    data.rulesText = rulesText;
  }
  const newStructureMax = getStructure((data.format as string | undefined) ?? tournament.format)?.maxEntries ?? null;
  if (
    body.participantCap !== undefined ||
    (lobbyCapacity !== null && tournament.participantCap > lobbyCapacity * groupCount) ||
    (newStructureMax !== null && tournament.participantCap > newStructureMax)
  ) {
    const participantCap = Number(body.participantCap ?? tournament.participantCap);
    const structureMax = getStructure((data.format as string | undefined) ?? tournament.format)?.maxEntries ?? null;
    const capLimit = style === "LOBBY" && lobbyCapacity !== null ? lobbyCapacity * groupCount : (structureMax ?? MAX_PARTICIPANT_CAP);
    if (!Number.isInteger(participantCap) || participantCap < 2 || participantCap > capLimit) {
      return NextResponse.json(
        {
          error:
            capLimit !== MAX_PARTICIPANT_CAP
              ? structureMax && style !== "LOBBY"
                ? `This structure can have at most ${capLimit} entries.`
                : groupCount > 1
                  ? `${groupCount} group lobbies hold ${capLimit} entries. Set a cap between 2 and ${capLimit}.`
                  : `This format's lobby holds ${capLimit} entries. Set a cap between 2 and ${capLimit}, or split into groups.`
              : `Participant cap must be a whole number between 2 and ${MAX_PARTICIPANT_CAP}.`,
        },
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

  // The prize split is part of what players signed up for: fixed once anyone has entered.
  const nextFormat = (data.format as string | undefined) ?? tournament.format;
  const nextCap = (data.participantCap as number | undefined) ?? tournament.participantCap;
  const nextPrize = data.prizeAmount !== undefined ? (data.prizeAmount as number | null) : tournament.prizeAmount;
  // The prize must stay fundable from entry fees whichever of the three numbers changed.
  if (!user.isStaff && (data.prizeAmount !== undefined || data.entryFee !== undefined || data.participantCap !== undefined)) {
    const feeSetting = await prisma.platformSetting.findUnique({ where: { id: "singleton" } });
    const fundingError = prizeFundingError({
      prizeAmount: nextPrize,
      entryFee: (data.entryFee as number | undefined) ?? tournament.entryFee,
      participantCap: nextCap,
      platformFeeBps: feeSetting?.platformFeeBps ?? 0,
    });
    if (fundingError) return NextResponse.json({ error: fundingError }, { status: 400 });
  }
  if (body.prizeSplit !== undefined || data.format !== undefined || data.participantCap !== undefined || data.prizeAmount !== undefined) {
    const split = parsePrizeSplit(body.prizeSplit ?? tournament.prizeSplit, maxPrizePlaces(nextFormat, nextCap, finalists));
    if (!split.ok) return NextResponse.json({ error: split.error }, { status: 400 });
    const value = nextPrize ? split.value : [];
    if (value.join() !== tournament.prizeSplit.join()) {
      const entered = await prisma.registration.count({ where: { tournamentId: id, status: { in: ["PENDING_PAYMENT", "CONFIRMED"] } } });
      if (entered > 0) {
        return NextResponse.json({ error: "The prize split is locked. Players have already registered for this tournament." }, { status: 409 });
      }
      data.prizeSplit = value;
    }
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
