/**
 * Circuit — shared team helpers. See the `Team`/`TeamMembership` models'
 * own schema comments for the "captain row + one-row-per-member, no
 * DECLINED state" conventions this all builds on.
 */

import { prisma } from "@/lib/db";

export type TeamRole =
  | { role: "none" }
  | { role: "captain" }
  | { role: "member" }
  | { role: "invited"; membershipId: string }
  /** I requested to join (Discovery Phase 3) and the captain hasn't accepted yet — distinct from "invited" (the captain started it), see TeamMembership.requestedByMember. */
  | { role: "requested"; membershipId: string };

/** The viewer's relationship to one team. */
export async function teamRoleFor(teamId: string, userId: string): Promise<TeamRole> {
  const team = await prisma.team.findUnique({ where: { id: teamId }, select: { captainId: true } });
  if (!team) return { role: "none" };
  if (team.captainId === userId) return { role: "captain" };

  const membership = await prisma.teamMembership.findUnique({
    where: { teamId_userId: { teamId, userId } },
  });
  if (!membership) return { role: "none" };
  if (membership.accepted) return { role: "member" };
  return membership.requestedByMember
    ? { role: "requested", membershipId: membership.id }
    : { role: "invited", membershipId: membership.id };
}

/** Every team a user captains or is an accepted member of. */
export async function getTeamIdsForUser(userId: string): Promise<string[]> {
  const [captained, memberships] = await Promise.all([
    prisma.team.findMany({ where: { captainId: userId }, select: { id: true } }),
    prisma.teamMembership.findMany({ where: { userId, accepted: true }, select: { teamId: true } }),
  ]);
  return [...new Set([...captained.map((t) => t.id), ...memberships.map((m) => m.teamId)])];
}

/** Every userId who shares at least one team with `userId` (never includes `userId` itself). */
export async function getTeammateIds(userId: string): Promise<string[]> {
  const teamIds = await getTeamIdsForUser(userId);
  if (teamIds.length === 0) return [];

  const [teams, memberships] = await Promise.all([
    prisma.team.findMany({ where: { id: { in: teamIds } }, select: { captainId: true } }),
    prisma.teamMembership.findMany({ where: { teamId: { in: teamIds }, accepted: true }, select: { userId: true } }),
  ]);
  const ids = new Set([...teams.map((t) => t.captainId), ...memberships.map((m) => m.userId)]);
  ids.delete(userId);
  return [...ids];
}
