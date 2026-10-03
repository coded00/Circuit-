/**
 * Circuit — asking for an account to be deleted. This is a request that
 * staff process by hand, not an instant delete: a player's money, their
 * results and the competitions they're in have to be settled first. The
 * request is refused while any of that is open, with the reasons spelled
 * out, and can be cancelled until staff act on it.
 */

import { prisma } from "@/lib/db";
import { notifyStaff } from "@/lib/notifications";

/** What has to be sorted out before this account can be deleted. Empty means it can be requested. */
export async function deletionBlockers(userId: string): Promise<string[]> {
  const [user, pendingWithdrawals, openChallenges, activeMatches, liveEntries] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { walletBalance: true } }),
    prisma.walletTransaction.count({ where: { userId, type: "WITHDRAWAL", status: "PENDING" } }),
    prisma.battle.count({ where: { creatorId: userId, status: { in: ["OPEN", "ACCEPTED"] } } }),
    prisma.match.count({ where: { OR: [{ playerAId: userId }, { playerBId: userId }], status: { in: ["UPCOMING", "NEEDS_RESULT", "DISPUTED"] } } }),
    prisma.registration.count({ where: { userId, status: { in: ["CONFIRMED", "PENDING_PAYMENT"] }, tournament: { status: { in: ["OPEN", "CLOSED", "LIVE"] } } } }),
  ]);
  const blockers: string[] = [];
  if (user.walletBalance > 0) blockers.push("Withdraw the balance left in your wallet.");
  if (pendingWithdrawals > 0) blockers.push("Wait for your withdrawal to finish processing.");
  if (openChallenges > 0) blockers.push("Cancel or finish your open challenges.");
  if (activeMatches > 0) blockers.push("Finish or report your matches in progress.");
  if (liveEntries > 0) blockers.push("Withdraw from, or finish, the tournaments you've entered.");
  return blockers;
}

type DeletionResult = { ok: true } | { ok: false; reasons: string[] };

export async function requestAccountDeletion(user: { id: string; handle: string; deletionRequestedAt: Date | null }): Promise<DeletionResult> {
  if (user.deletionRequestedAt) return { ok: true };
  const reasons = await deletionBlockers(user.id);
  if (reasons.length > 0) return { ok: false, reasons };
  await prisma.user.update({ where: { id: user.id }, data: { deletionRequestedAt: new Date() } });
  await notifyStaff("ACCOUNT_DELETION_REQUESTED", { userId: user.id, handle: user.handle }).catch(() => undefined);
  return { ok: true };
}

export async function cancelAccountDeletion(userId: string): Promise<void> {
  await prisma.user.update({ where: { id: userId }, data: { deletionRequestedAt: null } });
}
