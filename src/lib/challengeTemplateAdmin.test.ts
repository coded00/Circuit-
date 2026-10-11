import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { launchTemplate, listTemplates, runTemplateRotation, setTemplateState } from "@/lib/challengeTemplateAdmin";
import { cleanupAll, createTestStaff } from "@/testHelpers";

/**
 * The template switches and the daily rotation against the real database. Free Fire is published and Mobile Legends unpublished for
 * the tests' duration, then both are put back; every template state row they touch is removed afterwards. Launches use
 * a fixed, mid-day instant so the result doesn't depend on what time of day the suite happens to run.
 */

vi.setConfig({ testTimeout: 180_000, hookTimeout: 120_000 });

const KEY = "ff-booyah-hunter"; // Free Fire, winner-takes-₦12,000, checked from a screenshot
const OTHER_KEY = "mlbb-kill-leader"; // Mobile Legends: stays unpublished throughout
const NOON = new Date("2026-11-05T10:00:00Z"); // 11:00 in Lagos, a Thursday
const EVENING = new Date("2026-11-05T19:00:00Z"); // 20:00 in Lagos: entries have closed

let settings: { dailyChallengesEnabled: boolean } | null = null;
let freeFire: { id: string; publishedAt: Date | null } | null = null;
let mobileLegends: { id: string; publishedAt: Date | null } | null = null;

beforeAll(async () => {
  const s = await prisma.platformSetting.findUnique({ where: { id: "singleton" } });
  settings = s ? { dailyChallengesEnabled: s.dailyChallengesEnabled } : null;
  await prisma.platformSetting.upsert({ where: { id: "singleton" }, create: { id: "singleton", dailyChallengesEnabled: true }, update: { dailyChallengesEnabled: true } });
  const g = await prisma.game.findFirst({ where: { name: "Free Fire" }, select: { id: true, publishedAt: true } });
  if (!g) throw new Error("Free Fire isn't in the catalog — run scripts/seed-template-games.mjs first.");
  freeFire = g;
  await prisma.game.update({ where: { id: g.id }, data: { publishedAt: new Date(), enabled: true } });
  // Mobile Legends may be published in the catalog by now; the tests need it unpublished for their duration.
  const ml = await prisma.game.findFirst({ where: { name: "Mobile Legends" }, select: { id: true, publishedAt: true } });
  if (!ml) throw new Error("Mobile Legends isn't in the catalog — run scripts/seed-template-games.mjs first.");
  mobileLegends = ml;
  await prisma.game.update({ where: { id: ml.id }, data: { publishedAt: null } });
});

afterAll(async () => {
  if (freeFire) await prisma.game.update({ where: { id: freeFire.id }, data: { publishedAt: freeFire.publishedAt } });
  if (mobileLegends) await prisma.game.update({ where: { id: mobileLegends.id }, data: { publishedAt: mobileLegends.publishedAt } });
  if (settings) await prisma.platformSetting.update({ where: { id: "singleton" }, data: settings });
});

afterEach(async () => {
  await cleanupAll();
  await prisma.challengeTemplateState.deleteMany({ where: { templateKey: { in: [KEY, OTHER_KEY] } } });
});

describe("the library listing", () => {
  it("lists all 25 templates, off unless switched on, and says which games are published", async () => {
    const rows = await listTemplates();
    expect(rows).toHaveLength(25);
    // Staff may have switched other templates on for real; the tests only own the two they use.
    expect(rows.filter((r) => r.state.enabled && [KEY, OTHER_KEY].includes(r.template.key))).toHaveLength(0);
    expect(rows.find((r) => r.template.key === KEY)?.gamePublished).toBe(true);
    expect(rows.find((r) => r.template.key === OTHER_KEY)?.gamePublished).toBe(false);
  });
});

describe("switching a template", () => {
  it("won't switch one on whose game isn't published, and says what to do", async () => {
    const staff = await createTestStaff();
    const r = await setTemplateState({ key: OTHER_KEY, actorId: staff.id, enabled: true });
    expect(r).toMatchObject({ ok: false, status: 409, error: expect.stringContaining("Publish it in Admin → Games") });
    expect(await prisma.challengeTemplateState.findUnique({ where: { templateKey: OTHER_KEY } })).toBeNull();
  });

  it("switches one on and off, remembers the days and who did it, and audits it", async () => {
    const staff = await createTestStaff();
    expect((await setTemplateState({ key: KEY, actorId: staff.id, enabled: true, weekdays: [1, 3, 5] })).ok).toBe(true);
    const on = await prisma.challengeTemplateState.findUniqueOrThrow({ where: { templateKey: KEY } });
    expect(on).toMatchObject({ enabled: true, weekdays: [1, 3, 5], updatedById: staff.id });
    expect((await setTemplateState({ key: KEY, actorId: staff.id, enabled: false })).ok).toBe(true);
    expect((await prisma.challengeTemplateState.findUniqueOrThrow({ where: { templateKey: KEY } })).enabled).toBe(false);
    expect(await prisma.auditLogEntry.count({ where: { actorId: staff.id, action: { in: ["challengeTemplate.enable", "challengeTemplate.disable"] } } })).toBe(2);
  });

  it("refuses nonsense: an unknown template, no weekdays, a negative fee, a minimum above the maximum", async () => {
    const staff = await createTestStaff();
    expect(await setTemplateState({ key: "nope", actorId: staff.id, enabled: true })).toMatchObject({ ok: false, status: 404 });
    expect(await setTemplateState({ key: KEY, actorId: staff.id, weekdays: [] })).toMatchObject({ ok: false });
    expect(await setTemplateState({ key: KEY, actorId: staff.id, weekdays: [9] })).toMatchObject({ ok: false });
    expect(await setTemplateState({ key: KEY, actorId: staff.id, entryFee: -1 })).toMatchObject({ ok: false });
    expect(await setTemplateState({ key: KEY, actorId: staff.id, minEntrants: 50, maxEntrants: 10 })).toMatchObject({ ok: false });
  });
});

describe("launching", () => {
  it("creates and publishes the day's challenge from the template, with the money and rules it defines", async () => {
    const staff = await createTestStaff();
    const r = await launchTemplate({ key: KEY, actorId: staff.id, now: NOON });
    expect(r).toMatchObject({ ok: true, dateKey: "2026-11-05" });
    if (!r.ok) return;
    const c = await prisma.dailyChallenge.findUniqueOrThrow({ where: { id: r.challengeId }, include: { prizeCategories: true, requirements: true } });
    // The template's 100-player default is fitted to the pilot ceiling in force.
    const ceiling = (await prisma.platformSetting.findUniqueOrThrow({ where: { id: "singleton" } })).maxChallengeEntrants;
    expect(c).toMatchObject({ status: "OPEN", cadence: "DAILY", kind: "SKILL", templateKey: KEY, launchedForDate: "2026-11-05", entryFee: 100_000, minEntrants: 20, maxEntrants: Math.min(100, ceiling), platformFeeBps: 0, noWinnerPolicy: "HOUSE_KEEPS" });
    expect(c.prizeCategories).toHaveLength(1);
    expect(c.prizeCategories[0]).toMatchObject({ name: "Winner", amountKobo: 1_200_000 });
    expect(c.requirements.map((q) => q.label)).toEqual(["Win the match"]);
  });

  it("launches a template at most once per day: the second is refused, and the database wouldn't allow it anyway", async () => {
    const staff = await createTestStaff();
    expect((await launchTemplate({ key: KEY, actorId: staff.id, now: NOON })).ok).toBe(true);
    expect(await launchTemplate({ key: KEY, actorId: staff.id, now: NOON })).toMatchObject({ ok: false, status: 409, error: expect.stringContaining("already launched") });
    expect(await prisma.dailyChallenge.count({ where: { templateKey: KEY, launchedForDate: "2026-11-05" } })).toBe(1);
    const game = await prisma.game.findFirstOrThrow({ where: { name: "Free Fire" } });
    await expect(
      prisma.dailyChallenge.create({
        data: {
          gameId: game.id, gameName: game.name, title: "dup", rules: "r", evidenceRequirements: "e", metricLabel: "k", entryFee: 0, minEntrants: 1, maxEntrants: 5, status: "DRAFT",
          entryOpensAt: new Date(NOON.getTime() + 1), entryClosesAt: new Date(NOON.getTime() + 2), windowStartsAt: new Date(NOON.getTime() + 2), windowEndsAt: new Date(NOON.getTime() + 3), submissionsCloseAt: new Date(NOON.getTime() + 4),
          createdById: staff.id, templateKey: KEY, launchedForDate: "2026-11-05",
        },
      }),
    ).rejects.toThrow();
  });

  it("runs a template free, with no prizes, when its fee is overridden to 0", async () => {
    const staff = await createTestStaff();
    await setTemplateState({ key: KEY, actorId: staff.id, entryFee: 0 });
    const r = await launchTemplate({ key: KEY, actorId: staff.id, now: NOON });
    if (!r.ok) throw new Error(r.error);
    const c = await prisma.dailyChallenge.findUniqueOrThrow({ where: { id: r.challengeId }, include: { prizeCategories: true } });
    expect(c.entryFee).toBe(0);
    expect(c.prizeCategories).toHaveLength(0);
  });

  it("publishes nothing — and leaves no draft behind — when the game isn't published", async () => {
    const staff = await createTestStaff();
    const r = await launchTemplate({ key: OTHER_KEY, actorId: staff.id, now: NOON });
    expect(r).toMatchObject({ ok: false, status: 409 });
    expect(await prisma.dailyChallenge.count({ where: { templateKey: OTHER_KEY } })).toBe(0);
  });

  it("publishes nothing — and leaves no draft behind — when the platform switch is off", async () => {
    const staff = await createTestStaff();
    await prisma.platformSetting.update({ where: { id: "singleton" }, data: { dailyChallengesEnabled: false } });
    try {
      const r = await launchTemplate({ key: KEY, actorId: staff.id, now: NOON });
      expect(r).toMatchObject({ ok: false, error: expect.stringContaining("Not published") });
      expect(await prisma.dailyChallenge.count({ where: { templateKey: KEY } })).toBe(0);
    } finally {
      await prisma.platformSetting.update({ where: { id: "singleton" }, data: { dailyChallengesEnabled: true } });
    }
  });
});

describe("the rotation", () => {
  async function switchedOn(weekdays: number[]) {
    const staff = await createTestStaff();
    expect((await setTemplateState({ key: KEY, actorId: staff.id, enabled: true, weekdays })).ok).toBe(true);
    return staff;
  }

  it("launches an enabled template on its day while entries are open, records it, and doesn't repeat itself", async () => {
    await switchedOn([4]); // Thursday
    const first = await runTemplateRotation(NOON);
    expect(first.launched).toBe(1);
    const state = await prisma.challengeTemplateState.findUniqueOrThrow({ where: { templateKey: KEY } });
    expect(state).toMatchObject({ launchedOn: "2026-11-05", lastResult: "Launched for 2026-11-05." });
    expect((await runTemplateRotation(NOON)).launched).toBe(0);
    expect(await prisma.dailyChallenge.count({ where: { templateKey: KEY, launchedForDate: "2026-11-05" } })).toBe(1);
  });

  it("skips a template that's off, on the wrong day, or once the day's entries have closed", async () => {
    await switchedOn([1]); // Monday only: the 5th is a Thursday
    expect((await runTemplateRotation(NOON)).launched).toBe(0);
    await setTemplateState({ key: KEY, actorId: (await createTestStaff()).id, weekdays: [4] });
    expect((await runTemplateRotation(EVENING)).launched).toBe(0); // 20:00 Lagos
    await setTemplateState({ key: KEY, actorId: (await createTestStaff()).id, enabled: false });
    expect((await runTemplateRotation(NOON)).launched).toBe(0);
    expect(await prisma.dailyChallenge.count({ where: { templateKey: KEY } })).toBe(0);
  });

  it("says why when the platform switch is off, instead of failing quietly", async () => {
    await switchedOn([4]);
    await prisma.platformSetting.update({ where: { id: "singleton" }, data: { dailyChallengesEnabled: false } });
    try {
      expect((await runTemplateRotation(NOON)).launched).toBe(0);
      expect((await prisma.challengeTemplateState.findUniqueOrThrow({ where: { templateKey: KEY } })).lastResult).toContain("switched off");
    } finally {
      await prisma.platformSetting.update({ where: { id: "singleton" }, data: { dailyChallengesEnabled: true } });
    }
  });
});
