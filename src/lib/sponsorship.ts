/**
 * Circuit — the record of where a sponsored prize's money is coming from (TournamentSponsorship).
 *
 * A staff-run tournament is sponsored: its prize comes out of Circuit's own balance rather than the entry
 * fees, so the rule that a prize can't exceed what the players paid does not apply to it. Finding #3 of the
 * security audit is that exemption. Two things bound it now — the prize has a ceiling
 * (`maxSponsoredPrizeKobo`, src/lib/prizePool.ts) and it needs an approver who is neither the organizer nor
 * a winner (src/lib/payoutApproval.ts). This is the third: a written statement of where the money is
 * coming from, and for how much, before any of it can leave.
 *
 * The rule is a comparison, not a ledger. Nothing here moves money, reserves it or checks that it exists —
 * the platform's balance is the balance. What it does is make the approver's yes be a yes to something
 * specific, and make "we never asked where the money was coming from" impossible to say afterwards.
 *
 * `unbackedAmount` (src/lib/payoutReview.ts) is the figure to cover: for a sponsored tournament it is the
 * whole payable prize, since none of it came from entry fees.
 */

export const MAX_SPONSORSHIP_SOURCE_LENGTH = 200;
export const MAX_SPONSORSHIP_NOTE_LENGTH = 1000;

/**
 * How much of a payout's unbacked amount a recorded sponsorship does not cover. 0 when it does.
 *
 * One function so the approval route, the payouts page and the tests cannot disagree about what "covered"
 * means — an approver being told "covered" by a badge while the door refuses, or the reverse, is worse than
 * either answer on its own.
 */
export function sponsorshipShortfall(opts: { unbackedAmount: number; sponsorship: { amountKobo: number } | null }): number {
  if (opts.unbackedAmount <= 0) return 0;
  return Math.max(0, opts.unbackedAmount - (opts.sponsorship?.amountKobo ?? 0));
}

/**
 * The sentence to show when a sponsored payout can't be approved because of its funding record, or null
 * when there is nothing to say. Wording is shared for the same reason the arithmetic is: the person who
 * reads it on the Payouts page and the person who reads it in a refusal are looking at the same fact.
 */
export function sponsorshipRefusal(opts: { unbackedAmount: number; sponsorship: { amountKobo: number; source: string } | null }): string | null {
  const shortfall = sponsorshipShortfall(opts);
  if (shortfall <= 0) return null;
  // Both messages name the amount to be covered, and the second names the record it read. An approver told
  // only "there is a problem" has to go and work out which figure is wrong — and the one that is usually
  // wrong is the record, not the payout, which is the opposite of what a vague message implies.
  if (!opts.sponsorship) {
    return `${formatKobo(opts.unbackedAmount)} of this payout comes from Circuit's own balance, and nothing records where it is coming from. Record the sponsorship — what it is and where it comes from — before approving it.`;
  }
  return `The recorded sponsorship (${opts.sponsorship.source}) covers ${formatKobo(opts.sponsorship.amountKobo)} of the ${formatKobo(opts.unbackedAmount)} this payout takes from Circuit's balance, leaving ${formatKobo(shortfall)} unaccounted for. Record a sponsorship that covers it before approving.`;
}

function formatKobo(kobo: number): string {
  return `₦${Math.floor(kobo / 100).toLocaleString("en-NG")}`;
}
