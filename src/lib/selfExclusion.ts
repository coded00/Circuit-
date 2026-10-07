/**
 * Circuit — self-exclusion: the bar a player puts on their own account.
 *
 * Staked Battles are the only gambling-shaped thing Circuit has
 * (docs/circuit-strategy.md §10), and the tooling that makes them defensible
 * has three parts: cumulative stake limits, a cool-off a player can put on
 * themselves, and collusion detection. This is the middle one. It is the
 * staff-imposed `isSuspended` flag's mirror image — same shape of state, but
 * set by the player, for the player, and enforced in one place
 * (`lockStake`, src/lib/stakes.ts) rather than at every write action.
 *
 * What it does and doesn't stop is a deliberate choice, not an oversight. It
 * stops locking a stake: opening a staked Battle, hosting a Quick Match, or
 * accepting either. It does not stop free Battles, tournaments, paid entries,
 * the marketplace, or signing in — a cool-off that locks someone out of the
 * product entirely is one nobody sets, and none of those are the thing this
 * exists to interrupt. If a legal review decides the boundary sits somewhere
 * else, the enforcement point is one function.
 *
 * The rules that matter, and why:
 *
 *  - It ends at an absolute timestamp, not after a duration. A cool-off whose
 *    end nobody can name is one a player can talk themselves out of, and it
 *    is the same fact either way once it is written down. Expired means not
 *    excluded, so nothing has to run to end one.
 *  - It can be extended, never shortened. Otherwise the "are you sure" step
 *    is theatre: anyone who could shorten it could clear it.
 *  - Ending one early is a staff action (a support request, ordinarily) and
 *    goes through `logAdminAction`, so there is a record of who lifted whose
 *    cool-off and why. That is the whole point of the asymmetry.
 */

export const DAY_MS = 24 * 60 * 60 * 1000;

/** A day is the shortest cool-off worth having: shorter is a "no" that expires before it means anything. */
export const MIN_SELF_EXCLUSION_DAYS = 1;

/** Five years — effectively permanent, without being a value nothing can ever clear or outlive. */
export const MAX_SELF_EXCLUSION_DAYS = 1825;

/**
 * Whether a cool-off ending at `until` is in force. Null and expired are both
 * "not excluded". A type predicate as well as a test, so a caller that has
 * just asked can use the date without a non-null assertion.
 */
export function isSelfExcluded(until: Date | null | undefined, now: number = Date.now()): until is Date {
  return until != null && until.getTime() > now;
}

/**
 * West Africa Time, stated rather than inherited. The audience is Nigerian
 * (every amount and date in the app is formatted `en-NG`), and an exclusion
 * that lifts at 00:30 WAT is experienced as the next day by the player but
 * lands on the previous one in UTC — a cool-off that reads as ending a day
 * before it actually does is the wrong kind of surprise. Pinning the zone also
 * makes the server-rendered copy and the browser-rendered copy agree.
 */
export function formatSelfExclusionDate(date: Date): string {
  return date.toLocaleDateString("en-NG", { day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Lagos" });
}

/** The same date, shortened — for a status badge or a table cell, where the full month name doesn't fit. */
export function formatSelfExclusionDateShort(date: Date): string {
  return date.toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Lagos" });
}

/**
 * The one sentence a refusal says, wherever it happens — the Battle form, the
 * Quick Match screen, the accept button. Held here rather than at the refusal
 * site so a player who tries three different ways in gets told the same thing.
 */
export function selfExclusionMessage(until: Date): string {
  return `You've paused staked Battles until ${formatSelfExclusionDate(until)}. You can still play free Battles.`;
}

/**
 * The end date a request for `days` would produce. `resolveSelfExclusion`
 * below uses it, and so does the account page's preview — one piece of
 * arithmetic, so a confirmation that says "until 14 October" cannot promise a
 * date the server then stores differently.
 */
export function selfExclusionEnd(days: number, now: number = Date.now()): Date {
  return new Date(now + days * DAY_MS);
}

export type SelfExclusionChange =
  | { kind: "invalid" }
  | { kind: "shorten"; until: Date }
  | { kind: "extend"; until: Date; startedAt: Date }
  | { kind: "set"; until: Date; startedAt: Date };

/**
 * What a player's request amounts to, given what is already on file. Pure, and
 * deliberately the only place the extend-never-shorten rule is written down —
 * the route asks this function rather than deciding for itself, so a second
 * caller can't get a different answer.
 *
 * `startedAt` is the start of the run, not the moment of the request: an
 * extension keeps the original start, so "on a break since 3 August" stays
 * true after the end date moves.
 */
export function resolveSelfExclusion(
  currentUntil: Date | null,
  currentStart: Date | null,
  days: unknown,
  now: number = Date.now()
): SelfExclusionChange {
  if (typeof days !== "number" || !Number.isInteger(days)) return { kind: "invalid" };
  if (days < MIN_SELF_EXCLUSION_DAYS || days > MAX_SELF_EXCLUSION_DAYS) return { kind: "invalid" };

  const until = selfExclusionEnd(days, now);
  const startedAt = new Date(now);

  if (!isSelfExcluded(currentUntil, now)) return { kind: "set", until, startedAt };
  if (until.getTime() <= currentUntil.getTime()) return { kind: "shorten", until: currentUntil };
  return { kind: "extend", until, startedAt: currentStart ?? startedAt };
}
