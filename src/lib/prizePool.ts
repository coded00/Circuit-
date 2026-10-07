/**
 * Circuit — where a tournament's cash prize comes from. Organizers do not deposit money before they
 * host: the prize is paid out of the entry fees the tournament collects. So a prize can never be
 * worth more than those fees, and it is only released once the tournament is over (see the payout
 * route and settlement.ts for the T+1 wait).
 *
 * A tournament whose organizer is staff may be sponsored by the platform, so the entry-fee cap does
 * not apply to it — its prize is Circuit's own money. That exemption is not unlimited: it has its own
 * much higher ceiling (maxSponsoredPrizeKobo, see sponsoredPrizeCapError) and, at payout time, the
 * separation-of-duties rule in payoutApproval.ts. Both routes that can set a prize call
 * `prizeCapError` so the two doors onto this rule cannot drift apart — the finding this fixes existed
 * in both of them.
 */
import { prisma } from "@/lib/db";
import { computePlatformFee } from "@/lib/platformFee";

/** The ceiling on a sponsored prize when the setting row is missing. Must match the schema default. */
export const DEFAULT_MAX_SPONSORED_PRIZE_KOBO = 500_000_000;

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

/**
 * A message when a sponsored (staff-run) tournament's declared prize is above the platform's ceiling
 * for them, otherwise null.
 *
 * A staff-run tournament's prize is paid from Circuit's own balance rather than from entry fees, so
 * `prizeFundingError` above does not apply to it. Without this the exemption was unbounded: a staff
 * organizer could declare any prize at all. This is the bound, and it is deliberately generous — its
 * job is to stop a mistyped or bad-faith declaration, not to second-guess a real event. What actually
 * puts a person in front of the money is the separation-of-duties rule in payoutApproval.ts.
 */
export function sponsoredPrizeCapError(opts: { prizeAmount: number | null; capKobo: number }): string | null {
  const { prizeAmount, capKobo } = opts;
  if (!prizeAmount || prizeAmount <= 0) return null;
  if (prizeAmount > capKobo) {
    return `A sponsored prize can't be more than ₦${Math.floor(capKobo / 100).toLocaleString("en-NG")}. A staff-run tournament's prize comes out of Circuit's own balance rather than the entry fees, so it has its own ceiling. Lower the prize, or raise the sponsored-prize ceiling in Settings.`;
  }
  return null;
}

/**
 * The one entry point both prize-setting routes use (POST /api/tournaments and PATCH
 * /api/tournaments/[id]). Which rule applies depends on whether the organizer is staff, and reading the
 * setting once here is what keeps the two routes from disagreeing about it — the bypass this fixes was
 * present in both, because both had their own copy of the check.
 *
 * Returns the message to show, or null when the prize is allowed.
 */
export async function prizeCapError(opts: {
  prizeAmount: number | null;
  entryFee: number;
  participantCap: number;
  sponsored: boolean;
}): Promise<string | null> {
  const setting = await prisma.platformSetting.findUnique({ where: { id: "singleton" } });
  if (opts.sponsored) {
    return sponsoredPrizeCapError({ prizeAmount: opts.prizeAmount, capKobo: setting?.maxSponsoredPrizeKobo ?? DEFAULT_MAX_SPONSORED_PRIZE_KOBO });
  }
  return prizeFundingError({
    prizeAmount: opts.prizeAmount,
    entryFee: opts.entryFee,
    participantCap: opts.participantCap,
    platformFeeBps: setting?.platformFeeBps ?? 0,
  });
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
