/**
 * Circuit — where a tournament's cash prize comes from. Organizers do not deposit money before they
 * host: the prize is paid out of the entry fees the tournament collects. So a prize can never be
 * worth more than those fees, and it is only released once the tournament is over (see the payout
 * route and settlement.ts for the T+1 wait).
 *
 * A tournament whose organizer is staff may be sponsored by the platform, so the cap does not apply to it.
 */
import { prisma } from "@/lib/db";
import { computePlatformFee } from "@/lib/platformFee";

/** The most a tournament can ever collect for prizes: every spot paid for, platform fee already taken off. */
export function maxPrizePool(entryFee: number, participantCap: number, platformFeeBps: number): number {
  if (entryFee <= 0 || participantCap <= 0) return 0;
  return participantCap * (entryFee - computePlatformFee(entryFee, platformFeeBps));
}

/** A message when a declared prize couldn't possibly be funded by entry fees, otherwise null. */
export function prizeFundingError(opts: { prizeAmount: number | null; entryFee: number; participantCap: number; platformFeeBps: number }): string | null {
  const { prizeAmount, entryFee, participantCap, platformFeeBps } = opts;
  if (!prizeAmount || prizeAmount <= 0) return null;
  if (entryFee <= 0) return "A cash prize is paid from entry fees, so a free tournament can't offer one. Set an entry fee, or describe a non-cash prize instead.";
  const max = maxPrizePool(entryFee, participantCap, platformFeeBps);
  if (prizeAmount > max) {
    return `The prize can't be more than the entry fees this tournament can collect (₦${Math.floor(max / 100).toLocaleString("en-NG")} with every spot filled, after the platform fee). Lower the prize or raise the entry fee or spots.`;
  }
  return null;
}

/** Entry fees actually collected so far, after the platform fee. Refunded entries are excluded (their row is FAILED). */
export async function collectedForPrizes(tournamentId: string): Promise<number> {
  const rows = await prisma.escrowTransaction.aggregate({
    where: { tournamentId, type: "ORGANIZER_REVENUE", status: { in: ["PENDING", "COMPLETE"] } },
    _sum: { amount: true },
  });
  return rows._sum.amount ?? 0;
}

/**
 * How much of the declared prize pool can be paid: all of it if the fees collected cover it, otherwise
 * the same fraction of every share. Returns 0..1. A staff-run (sponsored) tournament is always paid in full.
 */
export async function payableFraction(tournament: { id: string; prizeAmount: number | null; organizerId: string }): Promise<number> {
  const declared = tournament.prizeAmount ?? 0;
  if (declared <= 0) return 0;
  const organizer = await prisma.user.findUnique({ where: { id: tournament.organizerId }, select: { isStaff: true } });
  if (organizer?.isStaff) return 1;
  const collected = await collectedForPrizes(tournament.id);
  return Math.min(1, collected / declared);
}

/** Hours after a tournament ends before any of its money moves (Paystack settles T+1). */
export async function releaseDelayHours(): Promise<number> {
  const setting = await prisma.platformSetting.findUnique({ where: { id: "singleton" } });
  return setting?.organizerRevenueSettlementHours ?? 24;
}
