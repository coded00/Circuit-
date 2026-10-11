/**
 * Circuit — Daily Challenges: the rules, with no database in them (docs/daily-challenges-spec.md).
 *
 * A Daily Challenge is solo and scored: players pay a fee from their wallet, play one match inside a fixed
 * window, upload scoreboard evidence, and staff verify it. The highest verified score wins the pool.
 *
 * Everything here is a pure function of values passed in — the state machine, the pool arithmetic, ranking
 * and tie-breaks, input validation, and the yes/no gates for entering, withdrawing and submitting — so the
 * rules that decide who gets paid can be tested without a database, and so routes, the sweep and the admin
 * pages all ask the same question the same way. The code that reads and writes rows (step 3 onwards) calls
 * these and does nothing clever of its own.
 *
 * Money is integer kobo throughout. Scores are whole numbers (a time is whole seconds or milliseconds, and
 * the challenge's `metricUnit` says which).
 */

import type { ChallengeCadence, ChallengeKind, DailyChallengeStatus, NoWinnerPolicy, ScoreDirection } from "@prisma/client";
import { computePlatformFee } from "@/lib/platformFee";
import { MAX_KOBO_COLUMN } from "@/lib/money";
import { parsePrizeSplit, prizeShares, type FinishGroup, type PrizeShare } from "@/lib/prizes";

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

// ---------------------------------------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------------------------------------

/**
 * Every move a challenge can make, and nothing else. CANCELLED is reachable from any state before the prize
 * is approved; after FINALIZED the standings are locked and the only way out is forward.
 */
const TRANSITIONS: Record<DailyChallengeStatus, readonly DailyChallengeStatus[]> = {
  DRAFT: ["SCHEDULED", "OPEN", "CANCELLED"],
  SCHEDULED: ["OPEN", "CANCELLED"],
  OPEN: ["LIVE", "CANCELLED"],
  LIVE: ["SUBMISSIONS_CLOSED", "CANCELLED"],
  SUBMISSIONS_CLOSED: ["UNDER_REVIEW", "CANCELLED"],
  UNDER_REVIEW: ["PROVISIONAL", "CANCELLED"],
  PROVISIONAL: ["FINALIZED", "UNDER_REVIEW", "CANCELLED"],
  FINALIZED: ["SETTLING"],
  SETTLING: ["COMPLETED"],
  COMPLETED: [],
  CANCELLED: [],
};

export function canTransition(from: DailyChallengeStatus, to: DailyChallengeStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/** A challenge that will never change state again. */
export function isTerminal(status: DailyChallengeStatus): boolean {
  return TRANSITIONS[status].length === 0;
}

/** States in which staff can still cancel, and every paying entry goes back. */
export function isCancellable(status: DailyChallengeStatus): boolean {
  return canTransition(status, "CANCELLED");
}

/** Standings are hidden until staff have verified them: nobody should see a rival's score and then enter. */
export function leaderboardVisible(status: DailyChallengeStatus): boolean {
  return status === "PROVISIONAL" || status === "FINALIZED" || status === "SETTLING" || status === "COMPLETED";
}

export type ClockFields = {
  status: DailyChallengeStatus;
  pausedAt: Date | null;
  minEntrants: number;
  entryOpensAt: Date;
  entryClosesAt: Date;
  windowStartsAt: Date;
  submissionsCloseAt: Date;
  disputeWindowMinutes: number;
  provisionalAt: Date | null;
};

export type ClockContext = {
  /** Entries still in the running: not withdrawn and not refunded. */
  activeEntryCount: number;
  /** Submissions waiting on a reviewer. */
  pendingSubmissions: number;
  /** Disputes nobody has ruled on yet. */
  openDisputes: number;
};

export type TimedMove = { to: DailyChallengeStatus; reason?: string };

export const UNDER_MIN_ENTRANTS_REASON = "Not enough players entered. Every entry fee has been refunded.";

/**
 * The next move the clock (and the state of the queue) calls for, or null. One step at a time: the sweep calls
 * this again after applying a move, so a challenge that was left alone for a day catches up in order and
 * every step is a compare-and-swap on `status` that a second sweep running at once cannot repeat.
 *
 * Not time-driven, and so never returned here: FINALIZED → SETTLING (a named person approves the prize) and
 * SETTLING → COMPLETED (the money has actually moved). A paused challenge does not move at all.
 */
export function nextTimedMove(c: ClockFields, ctx: ClockContext, now: Date): TimedMove | null {
  if (c.pausedAt) return null;
  const t = now.getTime();
  switch (c.status) {
    case "SCHEDULED":
      return t >= c.entryOpensAt.getTime() ? { to: "OPEN" } : null;
    case "OPEN":
      // Entries closed and too few came: the challenge cannot run fairly, so it ends and everyone is refunded.
      if (t >= c.entryClosesAt.getTime() && ctx.activeEntryCount < c.minEntrants) {
        return { to: "CANCELLED", reason: UNDER_MIN_ENTRANTS_REASON };
      }
      return t >= c.windowStartsAt.getTime() ? { to: "LIVE" } : null;
    case "LIVE":
      return t >= c.submissionsCloseAt.getTime() ? { to: "SUBMISSIONS_CLOSED" } : null;
    case "SUBMISSIONS_CLOSED":
      return { to: "UNDER_REVIEW" };
    case "UNDER_REVIEW":
      return ctx.pendingSubmissions === 0 ? { to: "PROVISIONAL" } : null;
    case "PROVISIONAL": {
      // A dispute held open keeps the results provisional however long it takes to rule on.
      if (ctx.openDisputes > 0 || !c.provisionalAt) return null;
      const closesAt = c.provisionalAt.getTime() + c.disputeWindowMinutes * 60_000;
      return t >= closesAt ? { to: "FINALIZED" } : null;
    }
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------------------------------------
// The money
// ---------------------------------------------------------------------------------------------------------

export type Pool = {
  /** Fees collected. */
  gross: number;
  /** Circuit's cut, rounded per entry exactly as each CHALLENGE_PLATFORM_FEE row will be written. */
  platformFee: number;
  /** What the entries leave for prizes, before any sponsor. */
  entryPool: number;
  /** A sponsor's declared top-up (DailyChallengeSponsorship). */
  sponsor: number;
  /** What is shared across the places. */
  prizePool: number;
};

/**
 * The prize pool for a given number of entries. The platform fee is taken per entry and rounded per entry
 * (`computePlatformFee`), because that is how the ledger rows are written: a total computed in one go could
 * differ from the sum of the rows by a kobo, and the books would be a kobo out for ever.
 */
export function challengePool(opts: { entryFee: number; platformFeeBps: number; entryCount: number; sponsorKobo?: number }): Pool {
  const count = Math.max(0, Math.trunc(opts.entryCount));
  const fee = Math.max(0, Math.trunc(opts.entryFee));
  const perEntryCut = computePlatformFee(fee, opts.platformFeeBps);
  const gross = fee * count;
  const platformFee = perEntryCut * count;
  const entryPool = gross - platformFee;
  const sponsor = Math.max(0, Math.trunc(opts.sponsorKobo ?? 0));
  return { gross, platformFee, entryPool, sponsor, prizePool: entryPool + sponsor };
}

// ---------------------------------------------------------------------------------------------------------
// Ranking
// ---------------------------------------------------------------------------------------------------------

export type RankInput = {
  /** The key prizes are paid to — the player's user id. */
  userId: string;
  /** The verified score (never the claimed one). */
  score: number;
  tiebreakScore?: number | null;
};

export type RankOptions = {
  direction: ScoreDirection;
  /** Null when the challenge has no secondary stat; then only the primary score separates entries. */
  tiebreakDirection: ScoreDirection | null;
};

function compareBy(direction: ScoreDirection, a: number, b: number): number {
  // Negative = a is better.
  return direction === "HIGHER" ? b - a : a - b;
}

/**
 * Groups entries by finishing place, best first. Entries level on the primary score and the secondary stat
 * share a group, and `prizeShares` splits the combined prize of the places that group occupies between them.
 * Nobody is ever put ahead of someone they are level with: no coin flip, no earliest-upload, no arbitrary
 * pick. A missing secondary stat counts as worse than any number, so an entry that did not report one cannot
 * win a tie-break by omission.
 */
export function rankEntries(entries: readonly RankInput[], opts: RankOptions): FinishGroup[] {
  const better = (a: RankInput, b: RankInput): number => {
    const primary = compareBy(opts.direction, a.score, b.score);
    if (primary !== 0 || !opts.tiebreakDirection) return primary;
    const at = a.tiebreakScore;
    const bt = b.tiebreakScore;
    if (at == null && bt == null) return 0;
    if (at == null) return 1;
    if (bt == null) return -1;
    return compareBy(opts.tiebreakDirection, at, bt);
  };

  const sorted = [...entries].sort((a, b) => better(a, b) || a.userId.localeCompare(b.userId));
  const groups: FinishGroup[] = [];
  let anchor: RankInput | null = null;
  for (const entry of sorted) {
    if (anchor && better(anchor, entry) === 0) groups[groups.length - 1].userIds.push(entry.userId);
    else {
      groups.push({ userIds: [entry.userId] });
      anchor = entry;
    }
  }
  return groups;
}

/** Prize shares for the final standings. Thin wrapper so the challenge code and its tests share one call. */
export function challengePrizeShares(prizePool: number, split: readonly number[], groups: readonly FinishGroup[]): PrizeShare[] {
  return prizeShares(prizePool, split, groups);
}

// ---------------------------------------------------------------------------------------------------------
// Input: what an admin can save
// ---------------------------------------------------------------------------------------------------------

export const MAX_TITLE_LENGTH = 120;
export const MAX_RULES_LENGTH = 4000;
export const MAX_LABEL_LENGTH = 40;
export const MAX_DISPUTE_WINDOW_MINUTES = 24 * 60;
/** The most places a prize can be split across, however many players enter. */
export const MAX_PRIZE_PLACES = 8;

/** Pilot ceilings from PlatformSetting; saved challenges and entries are both checked against them. */
export type ChallengeLimits = {
  maxEntryFeeKobo: number;
  maxEntrants: number;
};

export type ChallengeInput = {
  gameId: string;
  gameModeId: string | null;
  title: string;
  rules: string;
  evidenceRequirements: string;
  requireRecording: boolean;
  kind: ChallengeKind;
  /** What the challenge is about, in the admin's words ("AK-47", "Sniper rifles"). Required for a weapon challenge. */
  weaponLabel: string | null;
  /** The ranked score can't be read off a scoreboard, so it can only be checked from a recording. */
  scoreNeedsRecording: boolean;
  /** A mandatory minimum for the ranked score. Null = the highest score wins whatever it is. */
  minScore: number | null;
  noWinnerPolicy: NoWinnerPolicy;
  cadence: ChallengeCadence;
  metricLabel: string;
  metricUnit: string | null;
  direction: ScoreDirection;
  tiebreakLabel: string | null;
  tiebreakDirection: ScoreDirection;
  tiebreakRule: string;
  entryFee: number;
  minEntrants: number;
  maxEntrants: number;
  prizeSplit: number[];
  entryOpensAt: Date;
  entryClosesAt: Date;
  windowStartsAt: Date;
  windowEndsAt: Date;
  submissionsCloseAt: Date;
  disputeWindowMinutes: number;
};

const DEFAULT_TIEBREAK_RULE = "Prize shares are split between the entries that are level.";

function text(raw: unknown, label: string, max: number, required: true): Result<string>;
function text(raw: unknown, label: string, max: number, required: false): Result<string | null>;
function text(raw: unknown, label: string, max: number, required: boolean): Result<string | null> {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value) return required ? { ok: false, error: `${label} is required.` } : { ok: true, value: null };
  if (value.length > max) return { ok: false, error: `${label} can be at most ${max} characters.` };
  return { ok: true, value };
}

function wholeNumber(raw: unknown, label: string, min: number, max: number): Result<number> {
  const n = typeof raw === "string" && raw.trim() !== "" ? Number(raw) : raw;
  if (typeof n !== "number" || !Number.isInteger(n)) return { ok: false, error: `${label} must be a whole number.` };
  if (n < min || n > max) return { ok: false, error: `${label} must be between ${min} and ${max}.` };
  return { ok: true, value: n };
}

function when(raw: unknown, label: string): Result<Date> {
  const d = typeof raw === "string" || typeof raw === "number" ? new Date(raw) : raw instanceof Date ? raw : null;
  if (!d || Number.isNaN(d.getTime())) return { ok: false, error: `${label} is not a valid date and time.` };
  return { ok: true, value: d };
}

function direction(raw: unknown, label: string, fallback: ScoreDirection): Result<ScoreDirection> {
  if (raw === undefined || raw === null || raw === "") return { ok: true, value: fallback };
  if (raw === "HIGHER" || raw === "LOWER") return { ok: true, value: raw };
  return { ok: false, error: `${label} must be HIGHER or LOWER.` };
}

/** The timeline in order, with a message that names the pair that is the wrong way round. */
export function timelineError(t: Pick<ChallengeInput, "entryOpensAt" | "entryClosesAt" | "windowStartsAt" | "windowEndsAt" | "submissionsCloseAt">): string | null {
  if (t.entryOpensAt >= t.entryClosesAt) return "Entries have to close after they open.";
  if (t.entryClosesAt > t.windowStartsAt) return "The match window can't start before entries close — nobody should enter after the first match is played.";
  if (t.windowStartsAt >= t.windowEndsAt) return "The match window has to end after it starts.";
  if (t.windowEndsAt > t.submissionsCloseAt) return "Submissions can't close before the match window ends.";
  return null;
}

/**
 * Turns what an admin form sends into a challenge that is safe to store, or says exactly what is wrong.
 * Checked again by the database (the CHECK constraints in the migration) — this is the message, that is the wall.
 */
export function parseChallengeInput(raw: unknown, limits: ChallengeLimits): Result<ChallengeInput> {
  if (!raw || typeof raw !== "object") return { ok: false, error: "Send the challenge as a JSON object." };
  const b = raw as Record<string, unknown>;

  const gameId = text(b.gameId, "Game", 64, true);
  if (!gameId.ok) return gameId;
  const title = text(b.title, "Title", MAX_TITLE_LENGTH, true);
  if (!title.ok) return title;
  const rules = text(b.rules, "Rules", MAX_RULES_LENGTH, true);
  if (!rules.ok) return rules;
  const evidence = text(b.evidenceRequirements, "Evidence requirements", MAX_RULES_LENGTH, true);
  if (!evidence.ok) return evidence;
  const metricLabel = text(b.metricLabel, "Score name", MAX_LABEL_LENGTH, true);
  if (!metricLabel.ok) return metricLabel;
  const metricUnit = text(b.metricUnit, "Score unit", MAX_LABEL_LENGTH, false);
  if (!metricUnit.ok) return metricUnit;
  const tiebreakLabel = text(b.tiebreakLabel, "Tie-break stat", MAX_LABEL_LENGTH, false);
  if (!tiebreakLabel.ok) return tiebreakLabel;
  const tiebreakRule = text(b.tiebreakRule, "Tie-break rule", MAX_RULES_LENGTH, false);
  if (!tiebreakRule.ok) return tiebreakRule;
  const gameModeId = text(b.gameModeId, "Mode", 64, false);
  if (!gameModeId.ok) return gameModeId;

  const dir = direction(b.direction, "Score direction", "HIGHER");
  if (!dir.ok) return dir;
  const tieDir = direction(b.tiebreakDirection, "Tie-break direction", "HIGHER");
  if (!tieDir.ok) return tieDir;

  const entryFee = wholeNumber(b.entryFee ?? 0, "Entry fee", 0, MAX_KOBO_COLUMN);
  if (!entryFee.ok) return entryFee;
  if (entryFee.value > limits.maxEntryFeeKobo) {
    return { ok: false, error: `Entry fee can be at most ₦${(limits.maxEntryFeeKobo / 100).toLocaleString("en-NG")} during the pilot.` };
  }
  const maxEntrants = wholeNumber(b.maxEntrants, "Maximum entrants", 1, limits.maxEntrants);
  if (!maxEntrants.ok) return maxEntrants;
  // A paid challenge with one player is just that player's own money coming back less a fee.
  const minFloor = entryFee.value > 0 ? 2 : 1;
  const minEntrants = wholeNumber(b.minEntrants ?? 2, "Minimum entrants", minFloor, maxEntrants.value);
  if (!minEntrants.ok) return minEntrants;

  // A place nobody can fill at the minimum would be a share of the pool that has nowhere to go.
  const split = parsePrizeSplit(b.prizeSplit, Math.min(MAX_PRIZE_PLACES, minEntrants.value));
  if (!split.ok) return { ok: false, error: split.error.replace("This tournament", "This challenge") };

  const opens = when(b.entryOpensAt, "Entries open");
  if (!opens.ok) return opens;
  const closes = when(b.entryClosesAt, "Entries close");
  if (!closes.ok) return closes;
  const starts = when(b.windowStartsAt, "Match window start");
  if (!starts.ok) return starts;
  const ends = when(b.windowEndsAt, "Match window end");
  if (!ends.ok) return ends;
  const subs = when(b.submissionsCloseAt, "Submissions close");
  if (!subs.ok) return subs;
  const order = timelineError({ entryOpensAt: opens.value, entryClosesAt: closes.value, windowStartsAt: starts.value, windowEndsAt: ends.value, submissionsCloseAt: subs.value });
  if (order) return { ok: false, error: order };

  const dispute = wholeNumber(b.disputeWindowMinutes ?? 30, "Dispute window", 0, MAX_DISPUTE_WINDOW_MINUTES);
  if (!dispute.ok) return dispute;

  const kind = b.kind === undefined || b.kind === null || b.kind === "" ? "STANDARD" : b.kind;
  if (kind !== "STANDARD" && kind !== "WEAPON" && kind !== "SKILL" && kind !== "COMBINED") return { ok: false, error: "Choose a challenge type: standard, weapon, skill or combined." };
  const weaponLabel = text(b.weaponLabel, "Weapon", MAX_LABEL_LENGTH, false);
  if (!weaponLabel.ok) return weaponLabel;
  if (kind === "WEAPON" && !weaponLabel.value) return { ok: false, error: "Say which weapon a weapon challenge is about." };
  const minScore = b.minScore === undefined || b.minScore === null || b.minScore === "" ? null : wholeNumber(b.minScore, "Minimum score", 0, 1_000_000);
  if (minScore !== null && !minScore.ok) return minScore;
  const noWinner = b.noWinnerPolicy === undefined || b.noWinnerPolicy === null || b.noWinnerPolicy === "" ? "HOUSE_KEEPS" : b.noWinnerPolicy;
  if (noWinner !== "HOUSE_KEEPS" && noWinner !== "REFUND_ENTRIES") return { ok: false, error: "Choose what happens to the money if nobody qualifies." };
  const cadence = b.cadence === "DAILY" ? "DAILY" : "ONE_OFF";

  return {
    ok: true,
    value: {
      gameId: gameId.value,
      gameModeId: gameModeId.value,
      title: title.value,
      rules: rules.value,
      evidenceRequirements: evidence.value,
      requireRecording: b.requireRecording === true,
      kind,
      weaponLabel: weaponLabel.value,
      scoreNeedsRecording: b.scoreNeedsRecording === true,
      minScore: minScore === null ? null : minScore.value,
      noWinnerPolicy: noWinner,
      cadence,
      metricLabel: metricLabel.value,
      metricUnit: metricUnit.value,
      direction: dir.value,
      tiebreakLabel: tiebreakLabel.value,
      tiebreakDirection: tieDir.value,
      tiebreakRule: tiebreakRule.value ?? DEFAULT_TIEBREAK_RULE,
      entryFee: entryFee.value,
      minEntrants: minEntrants.value,
      maxEntrants: maxEntrants.value,
      prizeSplit: split.value,
      entryOpensAt: opens.value,
      entryClosesAt: closes.value,
      windowStartsAt: starts.value,
      windowEndsAt: ends.value,
      submissionsCloseAt: subs.value,
      disputeWindowMinutes: dispute.value,
    },
  };
}

/**
 * What stops a saved challenge being published. A draft can be anything half-finished; a published one is a
 * promise players pay against, so it is held to more: the platform switch is on, the first deadline is still
 * ahead, and there is a prize to win — at the smallest field the challenge can run with, the pool still has to
 * pay every place something.
 */
export function publishRefusal(opts: {
  challenge: Pick<ChallengeInput, "entryFee" | "minEntrants" | "prizeSplit" | "entryOpensAt" | "entryClosesAt">;
  platformFeeBps: number;
  sponsorKobo: number;
  enabled: boolean;
  now: Date;
  /** The challenge pays by prize categories, so the rank-split pool rules below do not apply (see categoryPublishRefusal). */
  categoryMode?: boolean;
}): string | null {
  if (!opts.enabled) return "Daily Challenges are switched off. Turn them on in Settings before publishing one.";
  if (opts.challenge.entryClosesAt <= opts.now) return "Entries would already be closed. Move the dates forward.";
  if (opts.categoryMode) return null;
  const pool = challengePool({ entryFee: opts.challenge.entryFee, platformFeeBps: opts.platformFeeBps, entryCount: opts.challenge.minEntrants, sponsorKobo: opts.sponsorKobo });
  if (opts.challenge.entryFee > 0 && pool.prizePool <= 0) return "The platform fee leaves nothing for the prize. Lower the fee or raise the entry fee.";
  const places = opts.challenge.prizeSplit.length === 0 ? 1 : opts.challenge.prizeSplit.length;
  if (pool.prizePool > 0 && pool.prizePool < places) return "The prize pool is too small to pay every place.";
  return null;
}

// ---------------------------------------------------------------------------------------------------------
// Gates: may this person do this now?
// ---------------------------------------------------------------------------------------------------------

export type GateCode =
  | "DISABLED"
  | "NOT_OPEN"
  | "PAUSED"
  | "ENTRIES_CLOSED"
  | "FULL"
  | "ALREADY_ENTERED"
  | "FEE_ABOVE_CAP"
  | "NOT_ENTERED"
  | "WINDOW_STARTED"
  | "NOT_LIVE"
  | "SUBMISSIONS_CLOSED"
  | "ALREADY_SUBMITTED";

export type Refusal = { code: GateCode; message: string };

type GateChallenge = {
  status: DailyChallengeStatus;
  pausedAt: Date | null;
  entryFee: number;
  maxEntrants: number;
  entryOpensAt: Date;
  entryClosesAt: Date;
  windowStartsAt: Date;
  submissionsCloseAt: Date;
};

const refuse = (code: GateCode, message: string): Refusal => ({ code, message });

/**
 * May this player enter? Account-level rules (age, suspension, self-exclusion, wallet balance, in-game name)
 * are the caller's — they need the user row. These are the ones the challenge itself decides, and they are
 * all re-checked inside the entry transaction under a lock on the challenge row, so two players taking the
 * last place cannot both get it.
 */
export function entryRefusal(opts: {
  challenge: GateChallenge;
  activeEntryCount: number;
  alreadyEntered: boolean;
  enabled: boolean;
  maxEntryFeeKobo: number;
  now: Date;
}): Refusal | null {
  const { challenge: c, now } = opts;
  if (!opts.enabled) return refuse("DISABLED", "Daily Challenges aren't available right now.");
  if (c.pausedAt) return refuse("PAUSED", "This challenge is paused. Check back soon.");
  if (c.status === "SCHEDULED" || (c.status === "OPEN" && now < c.entryOpensAt)) return refuse("NOT_OPEN", "Entries haven't opened yet.");
  if (c.status !== "OPEN") return refuse("ENTRIES_CLOSED", "Entries for this challenge are closed.");
  if (now >= c.entryClosesAt) return refuse("ENTRIES_CLOSED", "Entries for this challenge are closed.");
  if (opts.alreadyEntered) return refuse("ALREADY_ENTERED", "You're already in this challenge.");
  if (opts.activeEntryCount >= c.maxEntrants) return refuse("FULL", "This challenge is full.");
  if (c.entryFee > opts.maxEntryFeeKobo) return refuse("FEE_ABOVE_CAP", "This challenge's entry fee is above the current limit.");
  return null;
}

/** An entry can be withdrawn, with its fee refunded, until the match window starts and only before anything is submitted. */
export function withdrawRefusal(opts: { challenge: GateChallenge; entryStatus: string; now: Date }): Refusal | null {
  const { challenge: c } = opts;
  if (opts.entryStatus !== "ENTERED") return refuse("NOT_ENTERED", "This entry can't be withdrawn.");
  if (c.pausedAt) return refuse("PAUSED", "This challenge is paused. Check back soon.");
  if (c.status !== "OPEN" && c.status !== "SCHEDULED") return refuse("WINDOW_STARTED", "The match window has started, so entries can't be withdrawn.");
  if (opts.now >= c.windowStartsAt) return refuse("WINDOW_STARTED", "The match window has started, so entries can't be withdrawn.");
  return null;
}

/** One scored attempt per entry, while the challenge is live and before submissions close. */
export function submitRefusal(opts: { challenge: GateChallenge; entryStatus: string; hasSubmission: boolean; now: Date }): Refusal | null {
  const { challenge: c } = opts;
  if (opts.entryStatus !== "ENTERED") return refuse("NOT_ENTERED", "You're not in this challenge.");
  if (c.pausedAt) return refuse("PAUSED", "This challenge is paused. Check back soon.");
  if (opts.hasSubmission) return refuse("ALREADY_SUBMITTED", "You've already submitted a score for this challenge.");
  // The sweep may be a couple of minutes behind the clock, so an OPEN challenge whose window has begun counts as live.
  const live = c.status === "LIVE" || (c.status === "OPEN" && opts.now >= c.windowStartsAt);
  if (!live || opts.now < c.windowStartsAt) return refuse("NOT_LIVE", "This challenge isn't accepting scores right now.");
  if (opts.now > c.submissionsCloseAt) return refuse("SUBMISSIONS_CLOSED", "Submissions for this challenge are closed.");
  return null;
}

/** Fees are kept when a player never submits — said up front on the entry screen. A change here is a rules change. */
export const NO_SUBMISSION_REFUNDS_FEE = false;

/** Entries that get their fee back when a challenge is cancelled: everyone who paid and hasn't already got it back. */
export function refundableOnCancel(entryStatus: string): boolean {
  return entryStatus !== "WITHDRAWN" && entryStatus !== "REFUNDED";
}

// ---------------------------------------------------------------------------------------------------------
// Evidence review
// ---------------------------------------------------------------------------------------------------------

/** The fixed list of reasons a reviewer can give, so they can be counted and a player is told something real. */
export const REVIEW_REASON_CODES = [
  "SCORE_MISMATCH",
  "WRONG_MODE_OR_MAP",
  "OUTSIDE_WINDOW",
  "NAME_MISMATCH",
  "UNREADABLE",
  "DUPLICATE_EVIDENCE",
  "EDITED_OR_FAKE",
  "RULES_VIOLATION",
  "REQUIREMENT_NOT_MET",
  "SCORE_BELOW_MINIMUM",
] as const;
export type ReviewReasonCode = (typeof REVIEW_REASON_CODES)[number];

export function isReviewReasonCode(value: unknown): value is ReviewReasonCode {
  return typeof value === "string" && (REVIEW_REASON_CODES as readonly string[]).includes(value);
}

/**
 * A reason for a reviewer to look harder, never a verdict: a screenshot's own timestamp is something the
 * phone wrote and a person can change, and a missing one is normal (apps strip metadata). Only a timestamp
 * that is present and clearly outside the match window is worth saying anything about.
 */
export function evidenceTimingFlag(opts: { capturedAt: Date | null; windowStartsAt: Date; submissionsCloseAt: Date }): "OUTSIDE_WINDOW" | null {
  if (!opts.capturedAt) return null;
  const t = opts.capturedAt.getTime();
  return t < opts.windowStartsAt.getTime() || t > opts.submissionsCloseAt.getTime() ? "OUTSIDE_WINDOW" : null;
}

// ---------------------------------------------------------------------------------------------------------
// Staff actions: pause, resume, edit
// ---------------------------------------------------------------------------------------------------------

/** Only a draft can be edited or deleted. Once published a challenge is a promise players have paid against. */
export function isEditable(status: DailyChallengeStatus): boolean {
  return status === "DRAFT";
}

/** States a pause makes sense in: something is running or waiting on a clock. A draft or a finished challenge has nothing to pause. */
export function isPausable(status: DailyChallengeStatus): boolean {
  return status === "SCHEDULED" || status === "OPEN" || status === "LIVE" || status === "SUBMISSIONS_CLOSED" || status === "UNDER_REVIEW" || status === "PROVISIONAL";
}

type Deadlines = {
  entryOpensAt: Date;
  entryClosesAt: Date;
  windowStartsAt: Date;
  windowEndsAt: Date;
  submissionsCloseAt: Date;
  provisionalAt: Date | null;
};

/**
 * What a pause does to the clock. While paused nothing advances and nobody can enter or submit, so the time
 * the pause took has to be given back: every deadline that had not yet passed when it started moves later by
 * exactly as long as it lasted, and the dispute window (which runs from `provisionalAt`) is stretched the same
 * way. A deadline that was already behind stays where it was — a pause never reopens something that had closed.
 *
 * Every moved deadline shifts by the same amount and an unmoved one is earlier than all the moved ones, so the
 * order the database insists on is preserved without having to re-validate it.
 */
export function shiftOnResume(c: Deadlines, pausedAt: Date, now: Date): Deadlines {
  const shiftMs = Math.max(0, now.getTime() - pausedAt.getTime());
  const later = (d: Date) => (d.getTime() > pausedAt.getTime() ? new Date(d.getTime() + shiftMs) : d);
  return {
    entryOpensAt: later(c.entryOpensAt),
    entryClosesAt: later(c.entryClosesAt),
    windowStartsAt: later(c.windowStartsAt),
    windowEndsAt: later(c.windowEndsAt),
    submissionsCloseAt: later(c.submissionsCloseAt),
    // The dispute window is measured from here, so moving it later is what extends it.
    provisionalAt: c.provisionalAt ? new Date(c.provisionalAt.getTime() + shiftMs) : null,
  };
}

// ---------------------------------------------------------------------------------------------------------
// Requirements: conditions and targets, checked by hand (docs/daily-challenges-spec.md §6b)
// ---------------------------------------------------------------------------------------------------------

export const MAX_REQUIREMENTS = 8;
export const MAX_REQUIREMENT_LABEL_LENGTH = 80;

export type RequirementKind = "CONDITION" | "TARGET";

/** A requirement as an admin defines it. `direction` and `threshold` exist only for a target. */
export type RequirementInput = {
  /** Stable while the form is being edited, so prize categories can point at it. Replaced by a database id once saved. */
  key: string;
  kind: RequirementKind;
  label: string;
  /** true: an entry has to meet this to rank at all. false: only the prize categories that name it care. */
  gate: boolean;
  /** The stat can't be read off a scoreboard (a weapon or headshot count), so a prize that depends on it needs a recording. */
  needsRecording: boolean;
  unit: string | null;
  direction: ScoreDirection | null;
  threshold: number | null;
};

/** A target with its threshold met: at least (HIGHER) or at most (LOWER). Level counts as met. */
export function targetMet(direction: ScoreDirection, threshold: number, value: number): boolean {
  return direction === "HIGHER" ? value >= threshold : value <= threshold;
}

/** How a requirement reads to a player: "Win the match", "At least 10 kills", "At most 600 seconds". */
export function describeRequirement(r: Pick<RequirementInput, "kind" | "label" | "unit" | "direction" | "threshold">): string {
  if (r.kind === "CONDITION" || r.threshold === null || r.direction === null) return r.label;
  const bound = r.direction === "HIGHER" ? "At least" : "At most";
  const unit = r.unit ? ` ${r.unit}` : "";
  return `${bound} ${r.threshold}${unit} — ${r.label.toLowerCase()}`;
}

/**
 * Turns the requirements an admin form sends into ones that are safe to store, or says what is wrong. Conditions
 * carry no number; a target must have one, and a direction. Order is kept: it is the order players see.
 */
export function parseRequirements(raw: unknown): Result<RequirementInput[]> {
  if (raw === undefined || raw === null || raw === "") return { ok: true, value: [] };
  if (!Array.isArray(raw)) return { ok: false, error: "Requirements must be a list." };
  if (raw.length > MAX_REQUIREMENTS) return { ok: false, error: `A challenge can have at most ${MAX_REQUIREMENTS} requirements.` };

  const out: RequirementInput[] = [];
  const seen = new Set<string>();
  const keys = new Set<string>();
  for (let i = 0; i < raw.length; i++) {
    const item = raw[i];
    const n = i + 1;
    if (!item || typeof item !== "object") return { ok: false, error: `Requirement ${n} isn't valid.` };
    const r = item as Record<string, unknown>;

    if (r.kind !== "CONDITION" && r.kind !== "TARGET") return { ok: false, error: `Requirement ${n}: choose condition or target.` };
    const label = typeof r.label === "string" ? r.label.trim() : "";
    if (!label) return { ok: false, error: `Requirement ${n} needs a label.` };
    if (label.length > MAX_REQUIREMENT_LABEL_LENGTH) return { ok: false, error: `Requirement ${n}'s label can be at most ${MAX_REQUIREMENT_LABEL_LENGTH} characters.` };
    const key = label.toLowerCase();
    if (seen.has(key)) return { ok: false, error: `"${label}" is listed twice.` };
    seen.add(key);

    const reqKey = typeof r.key === "string" && r.key.trim() ? r.key.trim() : `req-${i}`;
    if (keys.has(reqKey)) return { ok: false, error: "Two requirements share an id." };
    keys.add(reqKey);
    const gate = r.gate === false ? false : true;
    const needsRecording = r.needsRecording === true;

    if (r.kind === "CONDITION") {
      out.push({ key: reqKey, kind: "CONDITION", label, gate, needsRecording, unit: null, direction: null, threshold: null });
      continue;
    }

    const threshold = typeof r.threshold === "string" && r.threshold.trim() !== "" ? Number(r.threshold) : r.threshold;
    if (typeof threshold !== "number" || !Number.isInteger(threshold) || threshold < 0 || threshold > 1_000_000) {
      return { ok: false, error: `Requirement ${n}: the target must be a whole number from 0 to 1,000,000.` };
    }
    const direction = r.direction === "LOWER" ? "LOWER" : r.direction === "HIGHER" || r.direction === undefined || r.direction === null ? "HIGHER" : null;
    if (direction === null) return { ok: false, error: `Requirement ${n}: the target must be "at least" or "at most".` };
    const unit = typeof r.unit === "string" && r.unit.trim() ? r.unit.trim().slice(0, MAX_LABEL_LENGTH) : null;
    out.push({ key: reqKey, kind: "TARGET", label, gate, needsRecording, unit, direction, threshold });
  }
  return { ok: true, value: out };
}

/** What a player says about one requirement when they submit: ticked, or a number. */
export type RequirementClaim = { requirementId: string; claimedMet?: boolean; claimedValue?: number };

type RequirementRef = { id: string; kind: RequirementKind; label: string };

/**
 * A submission has to answer every requirement, exactly once: a condition is ticked (and a player who can't tick it
 * has not met it — they can still submit, and staff will reject it, but the form does not let them claim silence),
 * a target is a whole number. Anything else is a form error, not a verdict; the verdict is staff's.
 */
export function parseRequirementClaims(raw: unknown, requirements: readonly RequirementRef[]): Result<RequirementClaim[]> {
  if (requirements.length === 0) return { ok: true, value: [] };
  if (!Array.isArray(raw)) return { ok: false, error: "Answer every requirement before submitting." };

  const byId = new Map<string, Record<string, unknown>>();
  for (const item of raw) {
    if (!item || typeof item !== "object") return { ok: false, error: "A requirement answer isn't valid." };
    const entry = item as Record<string, unknown>;
    if (typeof entry.requirementId !== "string" || !requirements.some((r) => r.id === entry.requirementId)) return { ok: false, error: "That answer doesn't match a requirement of this challenge." };
    if (byId.has(entry.requirementId)) return { ok: false, error: "A requirement was answered twice." };
    byId.set(entry.requirementId, entry);
  }

  const claims: RequirementClaim[] = [];
  for (const r of requirements) {
    const entry = byId.get(r.id);
    if (!entry) return { ok: false, error: `Answer "${r.label}" before submitting.` };
    if (r.kind === "CONDITION") {
      if (typeof entry.claimedMet !== "boolean") return { ok: false, error: `Say whether you met "${r.label}".` };
      claims.push({ requirementId: r.id, claimedMet: entry.claimedMet });
    } else {
      const v = typeof entry.claimedValue === "string" && entry.claimedValue.trim() !== "" ? Number(entry.claimedValue) : entry.claimedValue;
      if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v > 1_000_000) return { ok: false, error: `"${r.label}" needs a whole number.` };
      claims.push({ requirementId: r.id, claimedValue: v });
    }
  }
  return { ok: true, value: claims };
}

export type RequirementVerdict = { requirementId: string; met: boolean | null };

/**
 * Whether a submission qualifies: every requirement has a verdict and every verdict is "met". A requirement with no
 * verdict yet is not met — a submission cannot be approved by leaving a line blank. `failed` lists what to name in
 * the rejection; `undecided` lists what a reviewer still has to answer.
 */
export function evaluateRequirements(
  requirements: readonly RequirementRef[],
  verdicts: readonly RequirementVerdict[],
): { qualifies: boolean; failed: string[]; undecided: string[] } {
  const byId = new Map(verdicts.map((v) => [v.requirementId, v.met]));
  const failed: string[] = [];
  const undecided: string[] = [];
  for (const r of requirements) {
    const met = byId.get(r.id);
    if (met === true) continue;
    if (met === false) failed.push(r.label);
    else undecided.push(r.label);
  }
  return { qualifies: failed.length === 0 && undecided.length === 0, failed, undecided };
}

/** Rejecting for a missed requirement uses this code, and the note names the lines. */
export const REQUIREMENT_NOT_MET = "REQUIREMENT_NOT_MET" as const;

// ---------------------------------------------------------------------------------------------------------
// Review: what a reviewer's decision has to be consistent with
// ---------------------------------------------------------------------------------------------------------

export type ReviewDecision = "APPROVE" | "REJECT" | "DISQUALIFY";

/** What a reason code says to the player whose score was turned down. */
export const REVIEW_REASON_LABEL: Record<ReviewReasonCode, string> = {
  SCORE_MISMATCH: "The score doesn't match the evidence",
  WRONG_MODE_OR_MAP: "The match wasn't in the required mode or on the required map",
  OUTSIDE_WINDOW: "The match was played outside the match window",
  NAME_MISMATCH: "The name in the evidence doesn't match your in-game name",
  UNREADABLE: "The evidence couldn't be read",
  DUPLICATE_EVIDENCE: "The same evidence was already used",
  EDITED_OR_FAKE: "The evidence looks edited or isn't genuine",
  RULES_VIOLATION: "A challenge rule was broken",
  REQUIREMENT_NOT_MET: "A requirement wasn't met",
  SCORE_BELOW_MINIMUM: "The score is below the minimum needed to qualify",
};

/**
 * The checks that keep a decision honest, given what the reviewer ticked. Returns the reason it can't be saved, or
 * null. An approval can't stand on a requirement that isn't met or isn't answered; a rejection for a missed
 * requirement has to point at one; a disqualification — the heaviest thing a reviewer can do, and the one that
 * keeps the fee — has to say why in words.
 */
export function reviewRefusal(opts: {
  decision: ReviewDecision;
  reasonCode: string | null;
  note: string | null;
  failed: readonly string[];
  undecided: readonly string[];
  verifiedScore: number | null;
  tiebreakRequired: boolean;
  verifiedTiebreak: number | null;
  /** The verified score is under the challenge's mandatory minimum. */
  belowMinimum?: boolean;
}): string | null {
  const { decision } = opts;
  if (decision === "APPROVE") {
    if (opts.belowMinimum) return "That score is below the minimum needed to qualify, so it can't be approved. Reject it instead.";
    if (opts.undecided.length > 0) return `Mark "${opts.undecided[0]}" as met or not met before approving.`;
    if (opts.failed.length > 0) return `"${opts.failed[0]}" isn't met, so this can't be approved. Reject it instead.`;
    if (opts.verifiedScore === null || !Number.isInteger(opts.verifiedScore) || opts.verifiedScore < 0) return "Enter the verified score — a whole number from the evidence.";
    if (opts.tiebreakRequired && (opts.verifiedTiebreak === null || !Number.isInteger(opts.verifiedTiebreak) || opts.verifiedTiebreak < 0)) return "Enter the verified tie-break stat too.";
    return null;
  }
  if (!isReviewReasonCode(opts.reasonCode)) return "Choose a reason.";
  if (opts.reasonCode === REQUIREMENT_NOT_MET && opts.failed.length === 0) return "No requirement is marked not met, so that can't be the reason.";
  if (decision === "DISQUALIFY" && !(opts.note && opts.note.trim().length >= 5)) return "A disqualification needs a written explanation — the player is told, and it's what an appeal is judged against.";
  return null;
}
