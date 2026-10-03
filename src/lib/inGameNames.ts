/**
 * Circuit — in-game names are unique inside a tournament.
 *
 * Two players with the same name in one bracket makes results, proof and
 * disputes ambiguous. Names are compared ignoring case and extra spaces, across
 * every active entry in the tournament: confirmed ones, entries mid-checkout
 * (held for a short while so an abandoned checkout doesn't block a name
 * forever), and team roster players.
 *
 * The locked form of the check runs inside the registration transaction, after
 * the tournament row is locked (src/lib/registrationCapacity.ts), so two
 * players can't both take the same name at the same moment.
 */

import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";

type Db = Prisma.TransactionClient | PrismaClient;

/** How long an unpaid checkout keeps its name reserved. */
const PENDING_HOLD_MS = 30 * 60_000;

export const normalizeInGameName = (name: string): string => name.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();

export class InGameNameTakenError extends Error {
  constructor(readonly inGameName: string) {
    super(`The in-game name "${inGameName}" is already taken in this tournament. Choose a different one.`);
  }
}

/** Every name in use in the tournament, normalised, apart from `exceptUserId`'s own entry. */
export async function takenInGameNames(db: Db, tournamentId: string, exceptUserId: string, opts: { confirmedOnly?: boolean } = {}): Promise<Set<string>> {
  const entries = await db.registration.findMany({
    where: {
      tournamentId,
      userId: { not: exceptUserId },
      OR: opts.confirmedOnly
        ? [{ status: "CONFIRMED" }]
        : [{ status: "CONFIRMED" }, { status: "PENDING_PAYMENT", updatedAt: { gte: new Date(Date.now() - PENDING_HOLD_MS) } }],
    },
    select: { inGameId: true, roster: { select: { inGameId: true } } },
  });
  const taken = new Set<string>();
  for (const entry of entries) {
    taken.add(normalizeInGameName(entry.inGameId));
    for (const member of entry.roster) if (member.inGameId) taken.add(normalizeInGameName(member.inGameId));
  }
  taken.delete("");
  return taken;
}

/** Throws InGameNameTakenError for the first name that's already used, or that appears twice in this entry. */
export async function assertInGameNamesFree(
  db: Db,
  tournamentId: string,
  exceptUserId: string,
  names: (string | null | undefined)[],
  opts: { confirmedOnly?: boolean } = {}
): Promise<void> {
  const wanted = names.filter((n): n is string => !!n && !!normalizeInGameName(n));
  const seen = new Set<string>();
  for (const name of wanted) {
    const key = normalizeInGameName(name);
    if (seen.has(key)) throw new InGameNameTakenError(name);
    seen.add(key);
  }
  if (wanted.length === 0) return;
  const taken = await takenInGameNames(db, tournamentId, exceptUserId, opts);
  for (const name of wanted) if (taken.has(normalizeInGameName(name))) throw new InGameNameTakenError(name);
}

/** Every in-game name a registration request is asking for: the captain's own plus the other roster players'. */
export function requestedInGameNames(inGameId: string, captainId: string, roster: { members: { userId: string; inGameId: string | null }[] } | null): string[] {
  return [inGameId, ...(roster?.members.filter((m) => m.userId !== captainId).map((m) => m.inGameId ?? "") ?? [])];
}

/** Remembers the name a player typed for a game, to pre-fill next time. Best effort — never blocks a registration. */
export async function rememberInGameName(userId: string, gameId: string | null, name: string): Promise<void> {
  const clean = name.trim().slice(0, 60);
  if (!gameId || !clean) return;
  await prisma.userGameName
    .upsert({ where: { userId_gameId: { userId, gameId } }, update: { name: clean }, create: { userId, gameId, name: clean } })
    .catch(() => undefined);
}
