/**
 * Circuit — the sentence players are shown, and asked to confirm, about what happens to their entry fee if nobody
 * qualifies. It is built from the challenge's stored policy, never typed by hand, so the page can't say one thing while
 * the settlement does another.
 */

import type { NoWinnerPolicy } from "@prisma/client";

/**
 * Null when there is nothing to disclose: a free challenge, or one with no mandatory target (the best score simply
 * wins), where "nobody qualifies" can only mean nobody submitted a verified score.
 */
export function noWinnerNotice(opts: { policy: NoWinnerPolicy; hasMandatoryTarget: boolean; entryFee: number }): string | null {
  if (opts.entryFee <= 0) return null;
  if (opts.policy === "REFUND_ENTRIES") return "If nobody qualifies, every entry fee is refunded.";
  if (!opts.hasMandatoryTarget) return null;
  return "If nobody meets the required target, entry fees are not returned — Circuit keeps the money.";
}
