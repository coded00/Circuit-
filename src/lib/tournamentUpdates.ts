/**
 * Circuit — an organizer's announcements on a tournament ("room details are
 * in the community", "start pushed back 30 minutes"). Only the organizer
 * writes them; everyone entered hears about each one; the organizer or staff
 * can delete one. Plain text only.
 */

import { prisma } from "@/lib/db";
import { notify } from "@/lib/notifications";

import { MAX_UPDATE_LENGTH } from "@/lib/tournamentUpdateRules";

export { MAX_UPDATE_LENGTH };

export class UpdateError extends Error {
  constructor(
    public code: "NOT_FOUND" | "FORBIDDEN" | "INVALID",
    message: string,
  ) {
    super(message);
    this.name = "UpdateError";
  }
}

/** The trimmed text, or null if it's empty, too long or not text. */
export function parseUpdateBody(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text.length > 0 && text.length <= MAX_UPDATE_LENGTH ? text : null;
}

/** Everyone entered: confirmed entrants and, for team entries, the roster. */
async function audience(tournamentId: string, excludeUserId: string): Promise<string[]> {
  const registrations = await prisma.registration.findMany({
    where: { tournamentId, status: "CONFIRMED" },
    select: { userId: true, roster: { select: { userId: true } } },
  });
  const ids = new Set<string>();
  for (const r of registrations) {
    ids.add(r.userId);
    for (const m of r.roster) ids.add(m.userId);
  }
  ids.delete(excludeUserId);
  return [...ids];
}

export async function postTournamentUpdate(input: { tournamentId: string; authorId: string; body: unknown }) {
  const body = parseUpdateBody(input.body);
  if (!body) throw new UpdateError("INVALID", `Write an update of up to ${MAX_UPDATE_LENGTH} characters.`);

  const tournament = await prisma.tournament.findUnique({ where: { id: input.tournamentId }, select: { id: true, name: true, organizerId: true } });
  if (!tournament) throw new UpdateError("NOT_FOUND", "Tournament not found.");
  if (tournament.organizerId !== input.authorId) throw new UpdateError("FORBIDDEN", "Only the organizer can post updates.");

  const update = await prisma.tournamentUpdate.create({ data: { tournamentId: tournament.id, authorId: input.authorId, body } });

  // Tell everyone entered, in small batches so a big field doesn't open hundreds of writes at once.
  const recipients = await audience(tournament.id, input.authorId);
  const payload = { tournamentId: tournament.id, tournamentName: tournament.name, snippet: body.slice(0, 120) };
  for (let i = 0; i < recipients.length; i += 50) {
    await Promise.all(recipients.slice(i, i + 50).map((userId) => notify(userId, "TOURNAMENT_UPDATE", payload).catch(() => undefined)));
  }
  return update;
}

export async function deleteTournamentUpdate(input: { updateId: string; tournamentId: string; actor: { id: string; isStaff: boolean } }) {
  const update = await prisma.tournamentUpdate.findUnique({
    where: { id: input.updateId },
    select: { id: true, tournamentId: true, tournament: { select: { organizerId: true } } },
  });
  if (!update || update.tournamentId !== input.tournamentId) throw new UpdateError("NOT_FOUND", "Update not found.");
  if (update.tournament.organizerId !== input.actor.id && !input.actor.isStaff) throw new UpdateError("FORBIDDEN", "Only the organizer can delete updates.");
  await prisma.tournamentUpdate.delete({ where: { id: update.id } });
}
