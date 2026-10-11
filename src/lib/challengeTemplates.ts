/**
 * Circuit — the library of ready-made Daily Challenges (docs/daily-challenges-spec.md §11): 25 templates across five
 * games that staff switch on and off. The definitions live here, in code, so they are reviewed, versioned and tested like
 * anything else; the database only remembers which templates are switched on and when they run.
 *
 * A template is not a challenge. It is the whole configuration of one — objective, scoring, requirements, evidence, prizes
 * — which `templateToDraft` turns into the body `createDraft` accepts, for a given game and day. Everything the template
 * produces goes through the same validation as a challenge an admin types in, and a template that would not pass it is a
 * test failure, not a runtime surprise.
 *
 * Money: every template is ₦1,000 to enter, 20 players to run and 100 at most, with one of three prize packs. Each pack
 * totals at most ₦14,000, which is exactly the 70% payout cap at the minimum field, so the house keeps at least ₦6,000
 * even at 20 players and the rest of whatever is collected. A prize nobody qualifies for, or that a combined prize
 * replaces, stays with the house.
 */

import type { ScoreDirection } from "@prisma/client";

const NAIRA = 100;

export type TemplateRequirement = {
  key: string;
  kind: "CONDITION" | "TARGET";
  label: string;
  /** true: everyone must meet it to rank. false: only the prizes that name it care. */
  gate: boolean;
  needsRecording?: boolean;
  /** TARGET only. */
  threshold?: number;
  direction?: ScoreDirection;
  unit?: string;
};

export type TemplatePrize = {
  key: string;
  name: string;
  amount: number;
  metricKey?: string;
  place?: number;
  requires?: string[];
  comboOf?: string[];
};

export type ChallengeTemplate = {
  key: string;
  /** The catalog game this runs on, by name. */
  game: string;
  title: string;
  kind: "WEAPON" | "SKILL" | "COMBINED";
  weaponLabel: string | null;
  /** The objective in one line, for the library and the card. */
  summary: string;
  rules: string;
  evidenceRequirements: string;
  /** A continuous recording is required (weapon, headshot and "Savage" stats can't be read off a scoreboard). */
  recording: boolean;
  /** The ranked score itself isn't on the scoreboard (a headshot count), so only a recording can check it. */
  scoreNeedsRecording: boolean;
  metricLabel: string;
  metricUnit: string | null;
  direction: ScoreDirection;
  /** Mandatory minimum for the ranked score. Under it nobody qualifies, however they rank. */
  minScore: number | null;
  requirements: TemplateRequirement[];
  prizes: TemplatePrize[];
};

// ---------------------------------------------------------------------------------------------------------
// Prize packs: ₦14,000, ₦14,000 and ₦12,000 at most
// ---------------------------------------------------------------------------------------------------------

/** Podium: first place ₦10,000, second ₦4,000, ranked by the challenge's score. */
const podium = (): TemplatePrize[] => [
  { key: "first", name: "1st place", amount: 10_000 * NAIRA, place: 1 },
  { key: "second", name: "2nd place", amount: 4_000 * NAIRA, place: 2 },
];

/** Winner takes ₦12,000: the best score among players who won the match. Needs a `win` requirement. */
const winner = (): TemplatePrize[] => [{ key: "winner", name: "Winner", amount: 12_000 * NAIRA, place: 1, requires: ["win"] }];

/**
 * Bounty: a champion prize (best score among those who met `championRequires`), a top-score prize, and a combined prize
 * for the player who is both, worth more than the two together would have been for separate winners.
 */
const bounty = (championRequires: string[]): TemplatePrize[] => [
  { key: "champion", name: "Champion", amount: 2_000 * NAIRA, place: 1, requires: championRequires },
  { key: "top", name: "Top score", amount: 2_000 * NAIRA, place: 1 },
  { key: "combo", name: "Ultimate Bounty", amount: 10_000 * NAIRA, comboOf: ["champion", "top"] },
];

const win = (gate: boolean): TemplateRequirement => ({ key: "win", kind: "CONDITION", label: "Win the match", gate });

const SCOREBOARD = "A screenshot of the full match-end scoreboard showing your in-game name and the final result.";
const RECORDING = "A continuous screen recording of the whole match, started by showing your entry code, plus a screenshot of the match-end scoreboard.";

function weapon(opts: { key: string; game: string; title: string; weapon: string; metric: string; min: number; extraRules?: string }): ChallengeTemplate {
  return {
    key: opts.key,
    game: opts.game,
    title: opts.title,
    kind: "WEAPON",
    weaponLabel: opts.weapon,
    summary: `Most ${opts.metric.toLowerCase()} in one match, ${opts.weapon} only`,
    rules: `Play one ${opts.game} Battle Royale match inside the match window. Only eliminations made with the ${opts.weapon} count towards your score; kills with other weapons don't. You need at least ${opts.min} qualifying kills to be ranked. ${opts.extraRules ?? ""}`.trim(),
    evidenceRequirements: RECORDING,
    recording: true,
    scoreNeedsRecording: false,
    metricLabel: opts.metric,
    metricUnit: null,
    direction: "HIGHER",
    minScore: opts.min,
    requirements: [],
    prizes: podium(),
  };
}

function headshots(opts: { key: string; game: string; title: string }): ChallengeTemplate {
  return {
    key: opts.key,
    game: opts.game,
    title: opts.title,
    kind: "SKILL",
    weaponLabel: null,
    summary: "Most headshot eliminations in one match",
    rules: `Play one ${opts.game} Battle Royale match inside the match window. Your score is your headshot eliminations. You need at least 5 to be ranked.`,
    evidenceRequirements: RECORDING,
    recording: true,
    scoreNeedsRecording: true,
    metricLabel: "Headshot kills",
    metricUnit: null,
    direction: "HIGHER",
    minScore: 5,
    requirements: [],
    prizes: podium(),
  };
}

function winnerChallenge(opts: { key: string; game: string; title: string; winWord: string }): ChallengeTemplate {
  return {
    key: opts.key,
    game: opts.game,
    title: opts.title,
    kind: "SKILL",
    weaponLabel: null,
    summary: `${opts.winWord} the match — the most kills among winners takes the prize`,
    rules: `Play one ${opts.game} match inside the match window and win it. Among players who won, the most kills takes the prize.`,
    evidenceRequirements: SCOREBOARD,
    recording: false,
    scoreNeedsRecording: false,
    metricLabel: "Kills",
    metricUnit: null,
    direction: "HIGHER",
    minScore: null,
    requirements: [win(true)],
    prizes: winner(),
  };
}

function survival(opts: { key: string; game: string; title: string }): ChallengeTemplate {
  return {
    key: opts.key,
    game: opts.game,
    title: opts.title,
    kind: "SKILL",
    weaponLabel: null,
    summary: "Best finishing placement, with at least 3 kills",
    rules: `Play one ${opts.game} Battle Royale match inside the match window. Your score is where you finished — 1 is the best. You need at least 3 kills to be ranked.`,
    evidenceRequirements: SCOREBOARD,
    recording: false,
    scoreNeedsRecording: false,
    metricLabel: "Placement",
    metricUnit: null,
    direction: "LOWER",
    minScore: null,
    requirements: [{ key: "kills", kind: "TARGET", label: "Kills", gate: true, threshold: 3, direction: "HIGHER" }],
    prizes: podium(),
  };
}

function bountyChallenge(opts: { key: string; game: string; title: string }): ChallengeTemplate {
  return {
    key: opts.key,
    game: opts.game,
    title: opts.title,
    kind: "COMBINED",
    weaponLabel: null,
    summary: "Win the match and top the kills: a bigger prize for doing both",
    rules: `Play one ${opts.game} match inside the match window. The Champion prize goes to the player with the most kills among those who won. The Top score prize goes to the most kills of anyone. A player who takes both receives the Ultimate Bounty instead of the two separate prizes.`,
    evidenceRequirements: SCOREBOARD,
    recording: false,
    scoreNeedsRecording: false,
    metricLabel: "Kills",
    metricUnit: null,
    direction: "HIGHER",
    minScore: null,
    requirements: [win(false)],
    prizes: bounty(["win"]),
  };
}

export const CHALLENGE_TEMPLATES: readonly ChallengeTemplate[] = [
  // ---- Call of Duty: Mobile ------------------------------------------------------------------------------
  weapon({ key: "codm-ak47-kill-leader", game: "CODM", title: "AK-47 Kill Leader", weapon: "AK-47", metric: "AK-47 kills", min: 5 }),
  weapon({ key: "codm-sniper-king", game: "CODM", title: "Sniper King", weapon: "Sniper rifles", metric: "Sniper kills", min: 3 }),
  weapon({ key: "codm-shotgun-mayhem", game: "CODM", title: "Shotgun Mayhem", weapon: "Shotguns", metric: "Shotgun kills", min: 5 }),
  headshots({ key: "codm-headshot-hunter", game: "CODM", title: "Headshot Hunter" }),
  winnerChallenge({ key: "codm-battle-royale-champion", game: "CODM", title: "Battle Royale Champion", winWord: "Win" }),
  bountyChallenge({ key: "codm-ultimate-bounty", game: "CODM", title: "Ultimate Bounty" }),

  // ---- PUBG Mobile ----------------------------------------------------------------------------------------
  weapon({ key: "pubgm-m416-kill-leader", game: "PUBG Mobile", title: "M416 Kill Leader", weapon: "M416", metric: "M416 kills", min: 5 }),
  weapon({ key: "pubgm-awm-sniper-king", game: "PUBG Mobile", title: "AWM Sniper King", weapon: "Sniper rifles", metric: "Sniper kills", min: 3 }),
  winnerChallenge({ key: "pubgm-chicken-dinner-hunter", game: "PUBG Mobile", title: "Chicken Dinner Hunter", winWord: "Win a chicken dinner:" }),
  survival({ key: "pubgm-survival-expert", game: "PUBG Mobile", title: "Survival Expert" }),
  bountyChallenge({ key: "pubgm-ultimate-bounty", game: "PUBG Mobile", title: "Ultimate Bounty" }),

  // ---- Free Fire ------------------------------------------------------------------------------------------
  weapon({ key: "ff-mp40-rush", game: "Free Fire", title: "MP40 Rush", weapon: "MP40", metric: "MP40 kills", min: 5 }),
  winnerChallenge({ key: "ff-booyah-hunter", game: "Free Fire", title: "Booyah Hunter", winWord: "Get the Booyah:" }),
  headshots({ key: "ff-headshot-master", game: "Free Fire", title: "Headshot Master" }),
  survival({ key: "ff-survival-expert", game: "Free Fire", title: "Survival Expert" }),
  bountyChallenge({ key: "ff-booyah-bounty", game: "Free Fire", title: "Booyah Bounty" }),

  // ---- eFootball ------------------------------------------------------------------------------------------
  {
    key: "efootball-goal-machine",
    game: "eFootball",
    title: "Goal Machine",
    kind: "SKILL",
    weaponLabel: null,
    summary: "Most goals in a single match, at least 3",
    rules: "Play one online eFootball match inside the match window. Your score is the goals you scored. You need at least 3 to be ranked.",
    evidenceRequirements: SCOREBOARD,
    recording: false,
    scoreNeedsRecording: false,
    metricLabel: "Goals",
    metricUnit: null,
    direction: "HIGHER",
    minScore: 3,
    requirements: [],
    prizes: podium(),
  },
  {
    key: "efootball-clean-sheet-king",
    game: "eFootball",
    title: "Clean Sheet King",
    kind: "SKILL",
    weaponLabel: null,
    summary: "Win without conceding — the most goals takes the prize",
    rules: "Play one online eFootball match inside the match window. You must win it without conceding a goal. Among players who did, the most goals scored takes the prize.",
    evidenceRequirements: SCOREBOARD,
    recording: false,
    scoreNeedsRecording: false,
    metricLabel: "Goals",
    metricUnit: null,
    direction: "HIGHER",
    minScore: null,
    requirements: [win(true), { key: "conceded", kind: "TARGET", label: "Goals conceded", gate: true, threshold: 0, direction: "LOWER" }],
    prizes: podium(),
  },
  {
    key: "efootball-possession-master",
    game: "eFootball",
    title: "Possession Master",
    kind: "SKILL",
    weaponLabel: null,
    summary: "Win with the highest possession, at least 60%",
    rules: "Play one online eFootball match inside the match window and win it. Your score is your possession percentage from the match stats screen. You need at least 60%.",
    evidenceRequirements: SCOREBOARD,
    recording: false,
    scoreNeedsRecording: false,
    metricLabel: "Possession",
    metricUnit: "%",
    direction: "HIGHER",
    minScore: 60,
    requirements: [win(true)],
    prizes: podium(),
  },
  {
    key: "efootball-perfect-match",
    game: "eFootball",
    title: "Perfect Match",
    kind: "COMBINED",
    weaponLabel: null,
    summary: "Win, keep a clean sheet and score at least 3: a bigger prize for the best of both",
    rules:
      "Play one online eFootball match inside the match window. You need at least 3 goals to be ranked. The Champion prize goes to the most goals among players who won and kept a clean sheet. The Top score prize goes to the most goals of anyone. A player who takes both receives the Perfect Match prize instead of the two separate prizes.",
    evidenceRequirements: SCOREBOARD,
    recording: false,
    scoreNeedsRecording: false,
    metricLabel: "Goals",
    metricUnit: null,
    direction: "HIGHER",
    minScore: 3,
    requirements: [win(false), { key: "conceded", kind: "TARGET", label: "Goals conceded", gate: false, threshold: 0, direction: "LOWER" }],
    prizes: [
      { key: "champion", name: "Champion", amount: 2_000 * NAIRA, place: 1, requires: ["win", "conceded"] },
      { key: "top", name: "Top score", amount: 2_000 * NAIRA, place: 1 },
      { key: "combo", name: "Perfect Match", amount: 10_000 * NAIRA, comboOf: ["champion", "top"] },
    ],
  },

  // ---- Mobile Legends: Bang Bang --------------------------------------------------------------------------
  {
    key: "mlbb-kill-leader",
    game: "Mobile Legends",
    title: "Kill Leader",
    kind: "SKILL",
    weaponLabel: null,
    summary: "Most kills in a won match, at least 8",
    rules: "Play one ranked or classic match inside the match window and win it. Your score is your kills on the results screen. You need at least 8 to be ranked.",
    evidenceRequirements: SCOREBOARD,
    recording: false,
    scoreNeedsRecording: false,
    metricLabel: "Kills",
    metricUnit: null,
    direction: "HIGHER",
    minScore: 8,
    requirements: [win(true)],
    prizes: podium(),
  },
  {
    key: "mlbb-assist-king",
    game: "Mobile Legends",
    title: "Assist King",
    kind: "SKILL",
    weaponLabel: null,
    summary: "Most assists in one match, at least 10",
    rules: "Play one ranked or classic match inside the match window. Your score is your assists on the results screen. You need at least 10 to be ranked.",
    evidenceRequirements: SCOREBOARD,
    recording: false,
    scoreNeedsRecording: false,
    metricLabel: "Assists",
    metricUnit: null,
    direction: "HIGHER",
    minScore: 10,
    requirements: [],
    prizes: podium(),
  },
  {
    key: "mlbb-savage-hunter",
    game: "Mobile Legends",
    title: "Savage Hunter",
    kind: "SKILL",
    weaponLabel: null,
    summary: "Record a Savage — the most kills in that match takes the prize",
    rules: "Play one ranked or classic match inside the match window and record a Savage (five kills in quick succession). Among players who did, the most kills in the match takes the prize.",
    evidenceRequirements: RECORDING,
    recording: true,
    scoreNeedsRecording: false,
    metricLabel: "Kills",
    metricUnit: null,
    direction: "HIGHER",
    minScore: null,
    requirements: [{ key: "savage", kind: "CONDITION", label: "Record a Savage", gate: true, needsRecording: true }],
    prizes: podium(),
  },
  {
    key: "mlbb-mvp-maker",
    game: "Mobile Legends",
    title: "MVP Maker",
    kind: "SKILL",
    weaponLabel: null,
    summary: "Win and be named MVP — the most kills among MVPs takes the prize",
    rules: "Play one ranked or classic match inside the match window, win it and be named MVP. Among players who did, the most kills takes the prize.",
    evidenceRequirements: SCOREBOARD,
    recording: false,
    scoreNeedsRecording: false,
    metricLabel: "Kills",
    metricUnit: null,
    direction: "HIGHER",
    minScore: null,
    requirements: [win(true), { key: "mvp", kind: "CONDITION", label: "Be named MVP", gate: true }],
    prizes: [{ key: "winner", name: "MVP", amount: 12_000 * NAIRA, place: 1, requires: ["win", "mvp"] }],
  },
  {
    key: "mlbb-ultimate-bounty",
    game: "Mobile Legends",
    title: "Ultimate Bounty",
    kind: "COMBINED",
    weaponLabel: null,
    summary: "Win as MVP and top the kills: a bigger prize for doing both",
    rules:
      "Play one ranked or classic match inside the match window. The Champion prize goes to the most kills among players who won and were named MVP. The Top score prize goes to the most kills of anyone. A player who takes both receives the Ultimate Bounty instead of the two separate prizes.",
    evidenceRequirements: SCOREBOARD,
    recording: false,
    scoreNeedsRecording: false,
    metricLabel: "Kills",
    metricUnit: null,
    direction: "HIGHER",
    minScore: null,
    requirements: [win(false), { key: "mvp", kind: "CONDITION", label: "Be named MVP", gate: false }],
    prizes: bounty(["win", "mvp"]),
  },
];

export const TEMPLATE_GAMES = ["CODM", "PUBG Mobile", "Free Fire", "eFootball", "Mobile Legends"] as const;

export function templateByKey(key: string): ChallengeTemplate | null {
  return CHALLENGE_TEMPLATES.find((t) => t.key === key) ?? null;
}

// ---------------------------------------------------------------------------------------------------------
// From a template to something createDraft accepts
// ---------------------------------------------------------------------------------------------------------

/** The hours of a standard day, in the platform's local time: entries 06:00–18:00, the match window 18:00–22:00, scores in by 23:00. */
export const DEFAULT_DAY = { entryOpensHour: 6, entryClosesHour: 18, windowStartsHour: 18, windowEndsHour: 22, submissionsCloseHour: 23 } as const;

/** Africa/Lagos is UTC+1 all year, with no daylight saving. */
const LAGOS_OFFSET_HOURS = 1;

/** The instant that is `hour`:00 in Lagos on the Lagos calendar day containing `reference`. */
export function lagosHour(reference: Date, hour: number): Date {
  const lagos = new Date(reference.getTime() + LAGOS_OFFSET_HOURS * 3_600_000);
  const midnightLagosAsUtc = Date.UTC(lagos.getUTCFullYear(), lagos.getUTCMonth(), lagos.getUTCDate());
  return new Date(midnightLagosAsUtc + (hour - LAGOS_OFFSET_HOURS) * 3_600_000);
}

export type TemplateOverrides = {
  /** Kobo. Defaults to ₦1,000; 0 makes it free (a free challenge pays no prizes unless sponsored). */
  entryFee?: number;
  minEntrants?: number;
  maxEntrants?: number;
};

/**
 * The body `createDraft` takes, for `template` on `day` (any instant on the Lagos day it should run). Prizes are dropped
 * for a free challenge — there is nothing to fund them from — so the same template can be run free or paid.
 */
export function templateToDraft(template: ChallengeTemplate, opts: { gameId: string; day: Date; overrides?: TemplateOverrides }): Record<string, unknown> {
  const fee = opts.overrides?.entryFee ?? 1_000 * NAIRA;
  const d = DEFAULT_DAY;
  return {
    gameId: opts.gameId,
    title: template.title,
    rules: template.rules,
    evidenceRequirements: template.evidenceRequirements,
    requireRecording: template.recording,
    kind: template.kind,
    weaponLabel: template.weaponLabel,
    scoreNeedsRecording: template.scoreNeedsRecording,
    minScore: template.minScore,
    noWinnerPolicy: "HOUSE_KEEPS",
    cadence: "DAILY",
    metricLabel: template.metricLabel,
    metricUnit: template.metricUnit,
    direction: template.direction,
    tiebreakLabel: null,
    tiebreakDirection: "HIGHER",
    entryFee: fee,
    minEntrants: opts.overrides?.minEntrants ?? 20,
    maxEntrants: opts.overrides?.maxEntrants ?? 100,
    prizeSplit: [],
    entryOpensAt: lagosHour(opts.day, d.entryOpensHour).toISOString(),
    entryClosesAt: lagosHour(opts.day, d.entryClosesHour).toISOString(),
    windowStartsAt: lagosHour(opts.day, d.windowStartsHour).toISOString(),
    windowEndsAt: lagosHour(opts.day, d.windowEndsHour).toISOString(),
    submissionsCloseAt: lagosHour(opts.day, d.submissionsCloseHour).toISOString(),
    disputeWindowMinutes: 30,
    requirements: template.requirements.map((r) => ({ key: r.key, kind: r.kind, label: r.label, gate: r.gate, needsRecording: r.needsRecording === true, threshold: r.threshold, direction: r.direction, unit: r.unit })),
    prizeCategories: fee > 0 ? template.prizes.map((p) => ({ key: p.key, name: p.name, amount: p.amount, metricKey: p.metricKey ?? null, place: p.place ?? 1, requires: p.requires ?? [], comboOf: p.comboOf ?? [] })) : [],
  };
}
