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
import { parseOptionalUrl, parseOptionalImageUrl } from "@/lib/validation";
import { parseLobbyGroups, parseLobbyRounds, type LobbyGroupsConfig } from "@/lib/lobbyScoring";
import { getStructure } from "@/lib/competitionStructures";
import { maxPrizePlaces, parsePrizeSplit } from "@/lib/prizes";
import { resolveCompetition } from "@/lib/competitionConfig";
import { parseLeagueSettings } from "@/lib/leagueTable";
import { notifyAllUsers } from "@/lib/notifications";
import { enableCommunity, postSystemMessage } from "@/lib/community";
import { hostableCommunities } from "@/lib/communityDirectory";
import { trackEvent } from "@/lib/analytics";
import { isRateLimited, recordAttempt } from "@/lib/rateLimit";
import { captureException } from "@/lib/observability";

const MAX_PARTICIPANT_CAP = 128; // D2: V1 bracket ceiling.

// V1 audit follow-up: every tournament creation triggers a platform-wide
// email+push blast via notifyAllUsers below, and this route is open to
// any signed-in player (ACC-4, no staff gate, no cost to create a free
// tournament) — nothing previously bounded how often one account could
// call this. Keyed by userId, not IP: the actor here is always a real
// signed-in account, so that's the more precise identity to throttle.
const TOURNAMENT_CREATE_MAX_ATTEMPTS = 5;
const TOURNAMENT_CREATE_WINDOW_MS = 60 * 60 * 1000;

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

  const rateLimitKey = `tournament-create:${user.id}`;
  const { limited, retryAfterSeconds } = await isRateLimited(rateLimitKey, {
    max: TOURNAMENT_CREATE_MAX_ATTEMPTS,
    windowMs: TOURNAMENT_CREATE_WINDOW_MS,
  });
  if (limited) {
    return NextResponse.json(
      { error: "Too many tournaments created recently. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
    );
  }
  // No real success/failure signal to branch on here — a repeated
  // malformed submission is just as throttle-worthy as a repeated valid
  // one, so every call that reaches this point counts (same reasoning as
  // the video view/share routes' own rate limiting).
  await recordAttempt(rateLimitKey);

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
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
  const posterUrlResult = parseOptionalImageUrl(body.posterUrl);

  // TRN-1: all fields required except prize info.
  if (!name || !rulesText) {
    return NextResponse.json({ error: "Name and rules are required." }, { status: 400 });
  }
  // Game → Mode → Format → Structure, checked against the game catalog.
  const competition = await resolveCompetition(body);
  if (!competition.ok) {
    return NextResponse.json({ error: competition.error }, { status: 400 });
  }
  // Lobby tournaments are one lobby, so the lobby's size is the cap.
  // Round robins are capped by the structure (every pairing is a match).
  const structureMax = getStructure(competition.fields.format)?.maxEntries ?? null;
  // Groups, then a final: each group is a lobby, so the cap can be groups × lobby size.
  const groupCount = competition.fields.competitionStyle === "LOBBY" && Number(body.lobbyGroups) >= 2 ? Number(body.lobbyGroups) : 1;
  const capLimit = competition.lobbyCapacity ? competition.lobbyCapacity * groupCount : (structureMax ?? MAX_PARTICIPANT_CAP);
  if (!Number.isInteger(participantCap) || participantCap < 2 || participantCap > capLimit) {
    return NextResponse.json(
      {
        error: competition.lobbyCapacity
          ? groupCount > 1
            ? `${groupCount} group lobbies hold ${capLimit} entries. Set a cap between 2 and ${capLimit}.`
            : `This format's lobby holds ${competition.lobbyCapacity} entries. Set a cap between 2 and ${competition.lobbyCapacity}, or split into groups.`
          : structureMax
            ? `A ${getStructure(competition.fields.format)!.label.toLowerCase()} can have at most ${structureMax} entries.`
            : `Participant cap must be a whole number between 2 and ${MAX_PARTICIPANT_CAP}.`,
      },
      { status: 400 }
    );
  }
  let lobbyRounds: number | null = null;
  let groups: LobbyGroupsConfig | null = null;
  if (competition.fields.competitionStyle === "LOBBY") {
    const rounds = parseLobbyRounds(body.lobbyRounds);
    if (!rounds.ok) return NextResponse.json({ error: rounds.error }, { status: 400 });
    lobbyRounds = rounds.value;
    const parsedGroups = parseLobbyGroups(
      { groups: body.lobbyGroups, qualifiers: body.lobbyQualifiers, finalRounds: body.lobbyFinalRounds },
      competition.lobbyCapacity,
      participantCap
    );
    if (!parsedGroups.ok) return NextResponse.json({ error: parsedGroups.error }, { status: 400 });
    groups = parsedGroups.value;
  }

  // League: points, draws, home-and-away and matchday length (src/lib/leagueTable.ts).
  let leagueData: { leagueWinPoints: number | null; leagueDrawPoints: number | null; leagueLegs: number | null; leagueMatchdayDays: number | null } = {
    leagueWinPoints: null,
    leagueDrawPoints: null,
    leagueLegs: null,
    leagueMatchdayDays: null,
  };
  if (competition.fields.format === "LEAGUE") {
    const league = parseLeagueSettings({
      winPoints: body.leagueWinPoints,
      drawPoints: body.leagueDrawPoints,
      allowDraws: body.leagueAllowDraws,
      legs: body.leagueLegs,
      matchdayDays: body.leagueMatchdayDays,
    });
    if (!league.ok) return NextResponse.json({ error: league.error }, { status: 400 });
    leagueData = { leagueWinPoints: league.value.winPoints, leagueDrawPoints: league.value.drawPoints, leagueLegs: league.value.legs, leagueMatchdayDays: league.value.matchdayDays };
  }

  // How the prize pool is shared (src/lib/prizes.ts); only with a cash prize.
  const finalists = groups ? groups.groups * groups.qualifiers : null;
  const split = parsePrizeSplit(body.prizeSplit, maxPrizePlaces(competition.fields.format, participantCap, finalists));
  if (!split.ok) return NextResponse.json({ error: split.error }, { status: 400 });
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

  // Hosting as a community event: only a community they own/moderate.
  let hostCommunityId: string | null = null;
  if (typeof body.hostCommunityId === "string" && body.hostCommunityId) {
    const allowed = await hostableCommunities(user);
    if (!allowed.some((c) => c.id === body.hostCommunityId)) {
      return NextResponse.json({ error: "You can only host for a community you run." }, { status: 403 });
    }
    hostCommunityId = body.hostCommunityId;
  }

  const organizerProfile = await prisma.organizerProfile.upsert({
    where: { userId: user.id },
    update: {},
    create: { userId: user.id },
  });

  const status = registrationOpenAt <= new Date() ? "OPEN" : "DRAFT";

  // Computed once, now, and stored concretely — see
  // Tournament.cancellationLockAt's own schema comment for why this
  // isn't re-derived from the platform setting later.
  const platformSetting = await prisma.platformSetting.findUnique({ where: { id: "singleton" } });
  const cancellationLockAt = new Date(
    startAt.getTime() - (platformSetting?.cancellationLockHoursBeforeStart ?? 24) * 60 * 60 * 1000
  );

  const tournament = await prisma.tournament.create({
    data: {
      organizerId: organizerProfile.userId,
      name,
      ...competition.fields,
      ...leagueData,
      lobbyRounds,
      lobbyGroups: groups?.groups ?? null,
      lobbyQualifiers: groups?.qualifiers ?? null,
      lobbyFinalRounds: groups?.finalRounds ?? null,
      prizeSplit: prizeAmount ? split.value : [],
      rulesText,
      participantCap,
      entryFee,
      prizeAmount,
      prizeText,
      registrationOpenAt,
      registrationCloseAt,
      startAt,
      cancellationLockAt,
      streamUrl: streamUrlResult.url,
      posterUrl: posterUrlResult.url,
      status,
      hostCommunityId,
    },
  });

  if (hostCommunityId) {
    await postSystemMessage(hostCommunityId, user.id, `🏆 New tournament: ${tournament.name} (${tournament.game}). Details and registration: /tournaments/${tournament.id}`).catch((err) =>
      captureException(err, { source: "tournaments/route.ts:announce", tournamentId: tournament.id })
    );
  }

  trackEvent("tournament_created", { userId: user.id, tournamentId: tournament.id, game: tournament.game });

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
  // V1 audit follow-up: a thrown error inside after() previously became
  // an unhandled rejection Next only logs to console — invisible to any
  // error-monitoring dashboard. Caught and captured here instead.
  after(() =>
    notifyAllUsers("NEW_TOURNAMENT", { tournamentId: tournament.id, name: tournament.name }).catch((err) =>
      captureException(err, { source: "tournaments/route.ts:after", tournamentId: tournament.id })
    )
  );

  return NextResponse.json({ id: tournament.id }, { status: 201 });
}
