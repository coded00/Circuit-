/**
 * Circuit — leaderboards on pages search engines read. The names of players who haven't made their profile public (or
 * who are under 18) don't go into those pages' text: a signed-out visitor, which is what a crawler is, sees such a
 * player as "Circuit player" with their record, and signed-in players see everyone as before.
 */
import { prisma } from "@/lib/db";
import { isProfileIndexable } from "@/lib/profileSeo";
import type { Standing } from "@/lib/standings";

export type PublicStanding = { rank: number; displayName: string; handle: string | null; wins: number; losses: number };

/** Which of these players are open to being named on a page a search engine reads: opted in, an adult, in good standing. */
export async function publicProfileIds(userIds: string[]): Promise<Set<string>> {
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, searchEngineIndexable: true, dateOfBirth: true, isSuspended: true, deletionRequestedAt: true },
  });
  return new Set(users.filter((u) => isProfileIndexable(u, true)).map((u) => u.id));
}

export async function standingsForViewer(standings: Standing[], signedIn: boolean): Promise<PublicStanding[]> {
  if (signedIn) return standings.map((s, i) => ({ rank: i + 1, displayName: s.displayName, handle: s.handle, wins: s.wins, losses: s.losses }));
  const open = await publicProfileIds(standings.map((s) => s.userId));
  return standings.map((s, i) =>
    open.has(s.userId)
      ? { rank: i + 1, displayName: s.displayName, handle: s.handle, wins: s.wins, losses: s.losses }
      : { rank: i + 1, displayName: "Circuit player", handle: null, wins: s.wins, losses: s.losses },
  );
}
