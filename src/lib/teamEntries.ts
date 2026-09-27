/**
 * Circuit — team entries for TEAM-format tournaments (game catalog phase 3).
 *
 * A team entry is the captain's own Registration plus the team and a
 * roster (RosterMember rows, captain included). Everything money- and
 * bracket-shaped keeps working unchanged because it already runs on the
 * registration's user: the captain pays the entry fee, takes the bracket
 * slot, reports results and receives the prize (no split payouts). What
 * this file adds is choosing and validating the roster, and showing the
 * team's name wherever an entry is displayed.
 */

import { prisma } from "@/lib/db";
import { notify } from "@/lib/notifications";

/** Registrations that currently hold a place (or are paying for one). */
export const ACTIVE_REGISTRATION = { in: ["PENDING_PAYMENT" as const, "CONFIRMED" as const] };

export type RosterBounds = { min: number; max: number };

/** Roster size limits for a tournament (snapshot of its format). */
export function rosterBounds(t: { playersPerTeam: number; minRoster: number | null; maxRoster: number | null }): RosterBounds {
  const min = Math.max(1, t.minRoster ?? t.playersPerTeam);
  const max = Math.max(min, t.maxRoster ?? t.playersPerTeam);
  return { min, max };
}

/** "5 players" / "5–7 players (subs allowed)". */
export function describeRoster(bounds: RosterBounds): string {
  return bounds.min === bounds.max ? `${bounds.min} players` : `${bounds.min}–${bounds.max} players`;
}

export class TeamEntryError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
    this.name = "TeamEntryError";
  }
}

type TournamentShape = { id: string; playersPerTeam: number; minRoster: number | null; maxRoster: number | null };

export type ValidRoster = { teamId: string; teamName: string; members: { userId: string; inGameId: string | null }[] };

/**
 * Checks a captain's entry: they captain the team, every roster player is
 * an accepted member (the captain always is), the size fits the format,
 * nobody is suspended, and neither the team nor any player is already in
 * another active entry for this tournament.
 */
export async function validateTeamEntry(tournament: TournamentShape, captainId: string, body: { teamId?: unknown; roster?: unknown }): Promise<ValidRoster> {
  if (typeof body.teamId !== "string") throw new TeamEntryError("Pick the team you're entering.");
  const team = await prisma.team.findUnique({
    where: { id: body.teamId },
    include: { members: { where: { accepted: true }, include: { user: { select: { id: true, isSuspended: true, displayName: true } } } } },
  });
  if (!team) throw new TeamEntryError("That team doesn't exist.", 404);
  if (team.captainId !== captainId) throw new TeamEntryError("Only the team's captain can enter it.", 403);

  const raw = Array.isArray(body.roster) ? body.roster : [];
  const picked = new Map<string, string | null>();
  for (const item of raw) {
    const userId = typeof item === "string" ? item : typeof item?.userId === "string" ? item.userId : null;
    if (!userId) continue;
    const inGameId = typeof item?.inGameId === "string" && item.inGameId.trim() ? item.inGameId.trim().slice(0, 60) : null;
    picked.set(userId, inGameId);
  }
  if (!picked.has(captainId)) picked.set(captainId, null); // the captain always plays

  const bounds = rosterBounds(tournament);
  if (picked.size < bounds.min || picked.size > bounds.max) {
    throw new TeamEntryError(`This format needs a roster of ${describeRoster(bounds)} — you picked ${picked.size}.`);
  }
  const members = new Map(team.members.map((m) => [m.userId, m.user]));
  members.set(captainId, members.get(captainId) ?? { id: captainId, isSuspended: false, displayName: "" });
  for (const userId of picked.keys()) {
    const member = members.get(userId);
    if (!member) throw new TeamEntryError("Everyone on the roster has to be an accepted member of the team.");
    if (member.isSuspended) throw new TeamEntryError(`${member.displayName || "A player"} is suspended and can't be on a roster.`);
  }

  const [teamTaken, clashes] = await Promise.all([
    prisma.registration.findFirst({
      where: { tournamentId: tournament.id, teamId: team.id, status: ACTIVE_REGISTRATION, NOT: { userId: captainId } },
      select: { id: true },
    }),
    prisma.rosterMember.findMany({
      where: {
        userId: { in: [...picked.keys()] },
        registration: { tournamentId: tournament.id, status: ACTIVE_REGISTRATION, NOT: { userId: captainId } },
      },
      include: { user: { select: { displayName: true } }, registration: { select: { teamName: true } } },
    }),
  ]);
  if (teamTaken) throw new TeamEntryError("This team is already entered.", 409);
  if (clashes.length > 0) {
    const c = clashes[0];
    throw new TeamEntryError(`${c.user.displayName} is already playing for ${c.registration.teamName ?? "another team"} in this tournament.`, 409);
  }
  return { teamId: team.id, teamName: team.name, members: [...picked].map(([userId, inGameId]) => ({ userId, inGameId })) };
}

/** Replaces an entry's roster (re-registering after a withdrawal can change it). */
export async function saveRoster(registrationId: string, members: ValidRoster["members"]) {
  await prisma.$transaction([
    prisma.rosterMember.deleteMany({ where: { registrationId } }),
    prisma.rosterMember.createMany({ data: members.map((m) => ({ registrationId, userId: m.userId, inGameId: m.inGameId })) }),
  ]);
}

/** Tells everyone on a confirmed roster (except the captain, who already knows). */
export async function notifyRoster(registrationId: string) {
  const reg = await prisma.registration.findUnique({
    where: { id: registrationId },
    include: { roster: { select: { userId: true } }, tournament: { select: { id: true, name: true } } },
  });
  if (!reg?.teamName) return;
  await Promise.all(
    reg.roster
      .filter((m) => m.userId !== reg.userId)
      .map((m) => notify(m.userId, "TEAM_ROSTER_ADDED", { tournamentId: reg.tournament.id, tournamentName: reg.tournament.name, teamName: reg.teamName }))
  );
}

export type CaptainTeamOption = {
  id: string;
  name: string;
  tag: string | null;
  /** Already entered (by this captain) or unavailable, and why. */
  blocked: string | null;
  members: { userId: string; handle: string; displayName: string; avatarUrl: string | null; isCaptain: boolean; busyWith: string | null }[];
};

/** The teams a user captains, with each member's availability for this tournament. */
export async function captainTeamOptions(userId: string, tournamentId: string): Promise<CaptainTeamOption[]> {
  const teams = await prisma.team.findMany({
    where: { captainId: userId },
    orderBy: { name: "asc" },
    include: { members: { where: { accepted: true }, include: { user: { select: { id: true, handle: true, displayName: true, avatarUrl: true, isSuspended: true } } } } },
  });
  if (teams.length === 0) return [];
  const [entered, busy] = await Promise.all([
    prisma.registration.findMany({
      where: { tournamentId, teamId: { in: teams.map((t) => t.id) }, status: ACTIVE_REGISTRATION, NOT: { userId } },
      select: { teamId: true },
    }),
    prisma.rosterMember.findMany({
      where: { registration: { tournamentId, status: ACTIVE_REGISTRATION, NOT: { userId } } },
      select: { userId: true, registration: { select: { teamName: true } } },
    }),
  ]);
  const enteredIds = new Set(entered.map((e) => e.teamId));
  const busyWith = new Map(busy.map((b) => [b.userId, b.registration.teamName ?? "another team"]));
  return teams.map((t) => {
    const members = t.members
      .filter((m) => !m.user.isSuspended)
      .map((m) => ({
        userId: m.userId,
        handle: m.user.handle,
        displayName: m.user.displayName,
        avatarUrl: m.user.avatarUrl,
        isCaptain: m.userId === t.captainId,
        busyWith: busyWith.get(m.userId) ?? null,
      }))
      .sort((a, b) => Number(b.isCaptain) - Number(a.isCaptain) || a.displayName.localeCompare(b.displayName));
    return { id: t.id, name: t.name, tag: t.tag, blocked: enteredIds.has(t.id) ? "Already entered" : null, members };
  });
}

export type TeamEntryLabel = { teamName: string; tag: string | null; roster: { handle: string; displayName: string; avatarUrl: string | null }[] };

/** Captain user id → their team entry, for showing teams instead of captains. */
export async function teamEntryLabels(tournamentId: string): Promise<Map<string, TeamEntryLabel>> {
  const regs = await prisma.registration.findMany({
    where: { tournamentId, teamName: { not: null } },
    include: {
      team: { select: { tag: true } },
      roster: { orderBy: { createdAt: "asc" }, include: { user: { select: { handle: true, displayName: true, avatarUrl: true } } } },
    },
  });
  return new Map(regs.map((r) => [r.userId, { teamName: r.teamName!, tag: r.team?.tag ?? null, roster: r.roster.map((m) => m.user) }]));
}

/** Swaps a captain's name for their team's on anything person-shaped. */
export function asTeam<T extends { id?: string; displayName: string; avatarUrl?: string | null }>(person: T, userId: string, labels: Map<string, TeamEntryLabel>): T {
  const label = labels.get(userId);
  return label ? { ...person, displayName: label.teamName, avatarUrl: null } : person;
}
