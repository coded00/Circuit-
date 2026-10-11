import { describe, expect, it } from "vitest";
import {
  CHALLENGE_TEMPLATES,
  DEFAULT_DAY,
  TEMPLATE_GAMES,
  lagosHour,
  templateByKey,
  templateToDraft,
} from "@/lib/challengeTemplates";
import { categoryPublishRefusal, parsePrizeCategories, settleCategories, worstCasePayout, type PrizeCategoryInput } from "@/lib/challengePrizes";
import { parseChallengeInput, parseRequirements } from "@/lib/dailyChallenges";

/**
 * The library is data, so the way to trust it is to run every template through the same checks a challenge typed into the
 * admin form must pass — and to check the money: each pack has to fit the payout cap at the smallest field.
 */

const limits = { maxEntryFeeKobo: 200_000, maxEntrants: 100 };
const DAY = new Date("2026-11-02T12:00:00Z");

describe("the library", () => {
  it("has 25 templates across the five games, with unique keys", () => {
    expect(CHALLENGE_TEMPLATES).toHaveLength(25);
    expect(new Set(CHALLENGE_TEMPLATES.map((t) => t.key)).size).toBe(25);
    expect([...new Set(CHALLENGE_TEMPLATES.map((t) => t.game))].sort()).toEqual([...TEMPLATE_GAMES].sort());
    const perGame = Object.fromEntries(TEMPLATE_GAMES.map((g) => [g, CHALLENGE_TEMPLATES.filter((t) => t.game === g).length]));
    expect(perGame).toEqual({ CODM: 6, "PUBG Mobile": 5, "Free Fire": 5, eFootball: 4, "Mobile Legends": 5 });
  });

  it("finds a template by key", () => {
    expect(templateByKey("codm-ak47-kill-leader")?.weaponLabel).toBe("AK-47");
    expect(templateByKey("nope")).toBeNull();
  });
});

describe.each(CHALLENGE_TEMPLATES.map((t) => [t.key, t] as const))("template %s", (_key, template) => {
  const body = templateToDraft(template, { gameId: "game-id", day: DAY });

  it("is a valid challenge", () => {
    const r = parseChallengeInput(body, limits);
    expect(r.ok, r.ok ? "" : r.error).toBe(true);
  });

  it("has valid requirements and prize categories, all pointing at things that exist", () => {
    const reqs = parseRequirements(body.requirements);
    expect(reqs.ok, reqs.ok ? "" : reqs.error).toBe(true);
    if (!reqs.ok) return;
    const cats = parsePrizeCategories(body.prizeCategories, {
      requirementKeys: new Set(reqs.value.map((r) => r.key)),
      targetKeys: new Set(reqs.value.filter((r) => r.kind === "TARGET").map((r) => r.key)),
    });
    expect(cats.ok, cats.ok ? "" : cats.error).toBe(true);
  });

  it("passes the publish rules at the default money: funded at the 70% cap, recording where needed", () => {
    const reqs = parseRequirements(body.requirements);
    const cats = parsePrizeCategories(body.prizeCategories, {
      requirementKeys: new Set(template.requirements.map((r) => r.key)),
      targetKeys: new Set(template.requirements.filter((r) => r.kind === "TARGET").map((r) => r.key)),
    });
    if (!reqs.ok || !cats.ok) throw new Error("did not parse");
    const refusal = categoryPublishRefusal({
      kind: template.kind,
      weaponLabel: template.weaponLabel,
      scoreNeedsRecording: template.scoreNeedsRecording,
      requireRecording: template.recording,
      prizeSplit: [],
      categories: cats.value,
      recordingStatKeys: new Set(reqs.value.filter((r) => r.needsRecording).map((r) => r.key)),
      entryFee: 100_000,
      minEntrants: 20,
      maxPayoutBps: 7000,
      sponsorKobo: 0,
    });
    expect(refusal).toBeNull();
    expect(worstCasePayout(cats.value)).toBeLessThanOrEqual(1_400_000);
  });

  it("pays something to somebody when entries qualify, and never more than its prizes", () => {
    const cats = parsePrizeCategories(body.prizeCategories, {
      requirementKeys: new Set(template.requirements.map((r) => r.key)),
      targetKeys: new Set(template.requirements.filter((r) => r.kind === "TARGET").map((r) => r.key)),
    });
    if (!cats.ok) throw new Error("did not parse");
    // Two qualified entries who have met every requirement and one who is clearly better: the best takes the top prize.
    const met = Object.fromEntries(template.requirements.map((r) => [r.key, true]));
    const targets = Object.fromEntries(template.requirements.filter((r) => r.kind === "TARGET").map((r) => [r.key, r.threshold ?? 0]));
    const higher = template.direction === "HIGHER";
    const entry = (userId: string, score: number) => ({ userId, score, tiebreakScore: null, targets, met });
    const r = settleCategories({
      categories: cats.value as PrizeCategoryInput[],
      entries: [entry("a", higher ? 20 : 1), entry("b", higher ? 10 : 5), entry("c", higher ? 5 : 9)],
      direction: template.direction,
      tiebreakDirection: null,
      targetDirections: Object.fromEntries(template.requirements.filter((x) => x.kind === "TARGET").map((x) => [x.key, x.direction ?? "HIGHER"])),
    });
    expect(r.awarded).toBeGreaterThan(0);
    expect(r.awarded).toBeLessThanOrEqual(worstCasePayout(cats.value));
  });

  it("asks for a recording when it is about a weapon or a stat the scoreboard doesn't show", () => {
    if (template.kind === "WEAPON") expect(template.recording).toBe(true);
    if (template.scoreNeedsRecording) expect(template.recording).toBe(true);
    if (template.requirements.some((r) => r.needsRecording)) expect(template.recording).toBe(true);
  });

  it("runs on a free entry with no prizes, so it can't promise what nothing funds", () => {
    const free = templateToDraft(template, { gameId: "g", day: DAY, overrides: { entryFee: 0, minEntrants: 1 } });
    expect(free.prizeCategories).toEqual([]);
    expect(parseChallengeInput(free, limits).ok).toBe(true);
  });
});

describe("the daily timeline", () => {
  it("puts a day's hours in Lagos time, in order, with entries closing before the match window", () => {
    const body = templateToDraft(CHALLENGE_TEMPLATES[0], { gameId: "g", day: DAY });
    const t = (k: string) => new Date(body[k] as string).getTime();
    expect(t("entryOpensAt")).toBeLessThan(t("entryClosesAt"));
    expect(t("entryClosesAt")).toBeLessThanOrEqual(t("windowStartsAt"));
    expect(t("windowStartsAt")).toBeLessThan(t("windowEndsAt"));
    expect(t("windowEndsAt")).toBeLessThanOrEqual(t("submissionsCloseAt"));
  });

  it("converts Lagos hours to UTC correctly, including around midnight", () => {
    // 06:00 Lagos on 2 Nov 2026 is 05:00 UTC.
    expect(lagosHour(new Date("2026-11-02T12:00:00Z"), DEFAULT_DAY.entryOpensHour).toISOString()).toBe("2026-11-02T05:00:00.000Z");
    // 23:30 UTC on 2 Nov is already 00:30 on 3 Nov in Lagos, so the day is the 3rd.
    expect(lagosHour(new Date("2026-11-02T23:30:00Z"), DEFAULT_DAY.entryOpensHour).toISOString()).toBe("2026-11-03T05:00:00.000Z");
    // 00:30 UTC on 3 Nov is 01:30 in Lagos on the same day.
    expect(lagosHour(new Date("2026-11-03T00:30:00Z"), 23).toISOString()).toBe("2026-11-03T22:00:00.000Z");
  });
});
