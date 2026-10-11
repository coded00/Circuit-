/**
 * Circuit — the staff side of Daily Challenges: create, edit, publish, pause, resume, cancel, delete.
 *
 * Every function here returns `{ ok: true, ... }` or `{ ok: false, error, status }` so the routes are one line
 * each and the rules live in one place. State changes are compare-and-swap (`updateMany` with the state we
 * read in the `where`), so two staff members pressing a button at once cannot both win: the loser's update
 * matches no row and gets a 409 instead of silently overwriting the other's change.
 *
 * The pure rules — what a valid challenge is, when it can be published, what a pause does to the clock — are
 * in src/lib/dailyChallenges.ts. This file only reads and writes rows around them.
 *
 * Cancelling refunds every entry (src/lib/dailyChallengeEntries.ts). The challenge is marked cancelled first, so
 * nobody can enter while refunds run, and a refund that fails is retried by the sweep rather than lost.
 */

import { randomUUID } from "crypto";

/**
 * An id with no hyphens. Challenge pages live at /battles/<id>, and the route reads everything before the first hyphen as the
 * id (battle URLs carry a slug after it), so a hyphenated id — a plain UUID — would be cut short and the page would not be found.
 */
const newId = () => randomUUID().replace(/-/g, "");
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { logAdminAction } from "@/lib/auditLog";
import { loadChallengeSettings } from "@/lib/dailyChallengeSettings";
import { refundAllEntries } from "@/lib/dailyChallengeEntries";
import { categoryPublishRefusal, parsePrizeCategories, type PrizeCategoryInput } from "@/lib/challengePrizes";
import {
  isCancellable,
  isEditable,
  isPausable,
  parseChallengeInput,
  parseRequirements,
  publishRefusal,
  shiftOnResume,
  type ChallengeInput,
} from "@/lib/dailyChallenges";

export type ActionResult<T extends object = object> = ({ ok: true } & T) | { ok: false; error: string; status: number };

const fail = (error: string, status = 400): { ok: false; error: string; status: number } => ({ ok: false, error, status });

export const MAX_REASON_LENGTH = 300;

/** A game a challenge can be set on: enabled and published, as in every other creation form. */
async function resolveCatalog(input: ChallengeInput): Promise<ActionResult<{ gameName: string; modeName: string | null }>> {
  const game = await prisma.game.findUnique({ where: { id: input.gameId }, select: { name: true, enabled: true, publishedAt: true } });
  if (!game || !game.enabled || !game.publishedAt) return fail("Pick a game that's published in Admin → Games.");
  if (!input.gameModeId) return { ok: true, gameName: game.name, modeName: null };
  const mode = await prisma.gameMode.findUnique({ where: { id: input.gameModeId }, select: { name: true, gameId: true, enabled: true } });
  if (!mode || mode.gameId !== input.gameId || !mode.enabled) return fail("That mode doesn't belong to the selected game.");
  return { ok: true, gameName: game.name, modeName: mode.name };
}

function dataFrom(input: ChallengeInput, catalog: { gameName: string; modeName: string | null }) {
  return {
    gameId: input.gameId,
    gameModeId: input.gameModeId,
    gameName: catalog.gameName,
    modeName: catalog.modeName,
    title: input.title,
    rules: input.rules,
    evidenceRequirements: input.evidenceRequirements,
    requireRecording: input.requireRecording,
    kind: input.kind,
    weaponLabel: input.weaponLabel,
    scoreNeedsRecording: input.scoreNeedsRecording,
    minScore: input.minScore,
    noWinnerPolicy: input.noWinnerPolicy,
    cadence: input.cadence,
    metricLabel: input.metricLabel,
    metricUnit: input.metricUnit,
    direction: input.direction,
    tiebreakLabel: input.tiebreakLabel,
    tiebreakDirection: input.tiebreakDirection,
    tiebreakRule: input.tiebreakRule,
    entryFee: input.entryFee,
    minEntrants: input.minEntrants,
    maxEntrants: input.maxEntrants,
    prizeSplit: input.prizeSplit,
    entryOpensAt: input.entryOpensAt,
    entryClosesAt: input.entryClosesAt,
    windowStartsAt: input.windowStartsAt,
    windowEndsAt: input.windowEndsAt,
    submissionsCloseAt: input.submissionsCloseAt,
    disputeWindowMinutes: input.disputeWindowMinutes,
  };
}

function reasonFrom(raw: unknown): ActionResult<{ reason: string }> {
  const reason = typeof raw === "string" ? raw.trim() : "";
  if (reason.length < 3) return fail("Say why — the reason is kept in the audit log and shown to players.");
  if (reason.length > MAX_REASON_LENGTH) return fail(`The reason can be at most ${MAX_REASON_LENGTH} characters.`);
  return { ok: true, reason };
}

/**
 * Requirements and prize categories as database rows. Both are written together because categories point at
 * requirements and at each other: ids are generated here so the references can be resolved before anything is inserted.
 * Returns the reason they can't be saved, or the rows.
 */
function buildRows(rawRequirements: unknown, rawCategories: unknown): { ok: true; requirements: Prisma.DailyChallengeRequirementCreateManyInput[]; categories: Prisma.DailyChallengePrizeCategoryCreateManyInput[]; categoryCount: number } | { ok: false; error: string } {
  const reqs = parseRequirements(rawRequirements);
  if (!reqs.ok) return { ok: false, error: reqs.error };
  const idOfRequirement = new Map(reqs.value.map((r) => [r.key, newId()]));
  const cats = parsePrizeCategories(rawCategories, {
    requirementKeys: new Set(reqs.value.map((r) => r.key)),
    targetKeys: new Set(reqs.value.filter((r) => r.kind === "TARGET").map((r) => r.key)),
  });
  if (!cats.ok) return { ok: false, error: cats.error };
  const idOfCategory = new Map(cats.value.map((c) => [c.key, newId()]));

  const requirements = reqs.value.map((r, i) => ({
    id: idOfRequirement.get(r.key) as string,
    challengeId: "",
    kind: r.kind,
    label: r.label,
    unit: r.unit,
    direction: r.direction,
    threshold: r.threshold,
    gate: r.gate,
    needsRecording: r.needsRecording,
    sortOrder: i,
  }));
  const categories = cats.value.map((c, i) => ({
    id: idOfCategory.get(c.key) as string,
    challengeId: "",
    name: c.name,
    amountKobo: c.amount,
    metricRequirementId: c.metricKey === null ? null : (idOfRequirement.get(c.metricKey) as string),
    place: c.place,
    requiresRequirementIds: c.requires.map((k) => idOfRequirement.get(k) as string),
    comboOfCategoryIds: c.comboOf.map((k) => idOfCategory.get(k) as string),
    sortOrder: i,
  }));
  return { ok: true, requirements, categories, categoryCount: categories.length };
}

export async function createDraft(
  raw: unknown,
  actorId: string,
  /** Set when the scheduler is launching a template for a day. Unique together at the database: one launch per template per day. */
  origin?: { templateKey: string; launchedForDate: string },
): Promise<ActionResult<{ id: string }>> {
  const settings = await loadChallengeSettings();
  const parsed = parseChallengeInput(raw, settings);
  if (!parsed.ok) return fail(parsed.error);
  const body = raw as Record<string, unknown>;
  const rows = buildRows(body.requirements, body.prizeCategories);
  if (!rows.ok) return fail(rows.error);
  const catalog = await resolveCatalog(parsed.value);
  if (!catalog.ok) return catalog;

  const id = newId();
  await prisma.$transaction(async (tx) => {
    await tx.dailyChallenge.create({
      data: { id, ...dataFrom(parsed.value, catalog), platformFeeBps: settings.platformFeeBps, createdById: actorId, ...(origin ? { templateKey: origin.templateKey, launchedForDate: origin.launchedForDate } : {}) },
    });
    if (rows.requirements.length > 0) await tx.dailyChallengeRequirement.createMany({ data: rows.requirements.map((r) => ({ ...r, challengeId: id })) });
    if (rows.categories.length > 0) await tx.dailyChallengePrizeCategory.createMany({ data: rows.categories.map((c) => ({ ...c, challengeId: id })) });
  });
  await logAdminAction({
    actorId,
    action: "dailyChallenge.create",
    targetType: "DailyChallenge",
    targetId: id,
    metadata: { title: parsed.value.title, kind: parsed.value.kind, entryFee: parsed.value.entryFee, requirements: rows.requirements.length, prizeCategories: rows.categoryCount },
  });
  return { ok: true, id };
}

export async function updateDraft(id: string, raw: unknown, actorId: string): Promise<ActionResult> {
  const current = await prisma.dailyChallenge.findUnique({ where: { id }, select: { status: true } });
  if (!current) return fail("Challenge not found.", 404);
  if (!isEditable(current.status)) return fail("Only a draft can be edited. A published challenge is a promise players have paid against — pause or cancel it instead.", 409);

  const settings = await loadChallengeSettings();
  const parsed = parseChallengeInput(raw, settings);
  if (!parsed.ok) return fail(parsed.error);
  const catalog = await resolveCatalog(parsed.value);
  if (!catalog.ok) return catalog;

  const body = raw as Record<string, unknown>;
  const rows = buildRows(body.requirements, body.prizeCategories);
  if (!rows.ok) return fail(rows.error);

  // Requirements and prize categories are replaced as a set, in the same transaction as the fields, so a failure leaves
  // the draft as it was. Categories go first: they point at requirements.
  const count = await prisma.$transaction(async (tx) => {
    const { count } = await tx.dailyChallenge.updateMany({
      where: { id, status: "DRAFT" },
      data: { ...dataFrom(parsed.value, catalog), platformFeeBps: settings.platformFeeBps },
    });
    if (count === 0) return 0;
    await tx.dailyChallengePrizeCategory.deleteMany({ where: { challengeId: id } });
    await tx.dailyChallengeRequirement.deleteMany({ where: { challengeId: id } });
    if (rows.requirements.length > 0) await tx.dailyChallengeRequirement.createMany({ data: rows.requirements.map((r) => ({ ...r, challengeId: id })) });
    if (rows.categories.length > 0) await tx.dailyChallengePrizeCategory.createMany({ data: rows.categories.map((c) => ({ ...c, challengeId: id })) });
    return count;
  });
  if (count === 0) return fail("This challenge was published while you were editing it.", 409);
  await logAdminAction({ actorId, action: "dailyChallenge.update", targetType: "DailyChallenge", targetId: id });
  return { ok: true };
}

export async function deleteDraft(id: string, actorId: string): Promise<ActionResult> {
  const current = await prisma.dailyChallenge.findUnique({ where: { id }, select: { status: true, title: true } });
  if (!current) return fail("Challenge not found.", 404);
  if (!isEditable(current.status)) return fail("Only a draft can be deleted. Cancel a published challenge instead, so its history is kept.", 409);
  const { count } = await prisma.dailyChallenge.deleteMany({ where: { id, status: "DRAFT" } });
  if (count === 0) return fail("This challenge was published while you were deleting it.", 409);
  await logAdminAction({ actorId, action: "dailyChallenge.delete", targetType: "DailyChallenge", targetId: id, metadata: { title: current.title } });
  return { ok: true };
}

export async function publishChallenge(id: string, actorId: string, now: Date = new Date()): Promise<ActionResult<{ status: "SCHEDULED" | "OPEN" }>> {
  const c = await prisma.dailyChallenge.findUnique({
    where: { id },
    include: {
      sponsorship: { select: { amountKobo: true } },
      game: { select: { enabled: true, publishedAt: true } },
      requirements: { select: { id: true, needsRecording: true } },
      prizeCategories: { orderBy: { sortOrder: "asc" } },
    },
  });
  if (!c) return fail("Challenge not found.", 404);
  if (c.status !== "DRAFT") return fail("This challenge is already published.", 409);
  if (!c.game.enabled || !c.game.publishedAt) return fail("The game for this challenge isn't published any more.");

  const settings = await loadChallengeSettings();
  // The ceilings may have been tightened since the draft was saved.
  if (c.entryFee > settings.maxEntryFeeKobo) return fail(`The entry fee is above the current limit of ₦${(settings.maxEntryFeeKobo / 100).toLocaleString("en-NG")}.`);
  if (c.maxEntrants > settings.maxEntrants) return fail(`The maximum entrants is above the current limit of ${settings.maxEntrants}.`);

  // A challenge with prize categories pays fixed prizes and the house keeps the rest, so no per-entry platform fee is
  // carved out at entry (and an entry that is refunded gets its whole fee back).
  const categories: PrizeCategoryInput[] = c.prizeCategories.map((p) => ({
    key: p.id,
    name: p.name,
    amount: p.amountKobo,
    metricKey: p.metricRequirementId,
    place: p.place,
    requires: p.requiresRequirementIds,
    comboOf: p.comboOfCategoryIds,
  }));
  const categoryMode = categories.length > 0;
  const platformFeeBps = categoryMode ? 0 : settings.platformFeeBps;

  const refusal = publishRefusal({ challenge: c, platformFeeBps, sponsorKobo: c.sponsorship?.amountKobo ?? 0, enabled: settings.enabled, now, categoryMode });
  if (refusal) return fail(refusal);
  const prizeRefusal = categoryPublishRefusal({
    kind: c.kind,
    weaponLabel: c.weaponLabel,
    scoreNeedsRecording: c.scoreNeedsRecording,
    requireRecording: c.requireRecording,
    prizeSplit: c.prizeSplit,
    categories,
    recordingStatKeys: new Set(c.requirements.filter((r) => r.needsRecording).map((r) => r.id)),
    entryFee: c.entryFee,
    minEntrants: c.minEntrants,
    maxPayoutBps: settings.maxPayoutBps,
    sponsorKobo: c.sponsorship?.amountKobo ?? 0,
  });
  if (prizeRefusal) return fail(prizeRefusal);

  const status = now >= c.entryOpensAt ? ("OPEN" as const) : ("SCHEDULED" as const);
  const { count } = await prisma.dailyChallenge.updateMany({
    where: { id, status: "DRAFT" },
    // The fee players agree to is the one in force at publish, and it is frozen from here on.
    data: { status, publishedAt: now, platformFeeBps },
  });
  if (count === 0) return fail("This challenge was published by someone else just now.", 409);
  await logAdminAction({ actorId, action: "dailyChallenge.publish", targetType: "DailyChallenge", targetId: id, metadata: { status, platformFeeBps, prizeCategories: categories.length } });
  return { ok: true, status };
}

export async function pauseChallenge(id: string, rawReason: unknown, actorId: string, now: Date = new Date()): Promise<ActionResult> {
  const reason = reasonFrom(rawReason);
  if (!reason.ok) return reason;
  const c = await prisma.dailyChallenge.findUnique({ where: { id }, select: { status: true, pausedAt: true } });
  if (!c) return fail("Challenge not found.", 404);
  if (c.pausedAt) return fail("This challenge is already paused.", 409);
  if (!isPausable(c.status)) return fail("There's nothing to pause at this stage.", 409);

  const { count } = await prisma.dailyChallenge.updateMany({
    where: { id, status: c.status, pausedAt: null },
    data: { pausedAt: now, pausedReason: reason.reason },
  });
  if (count === 0) return fail("This challenge changed while you were pausing it. Reload and try again.", 409);
  await logAdminAction({ actorId, action: "dailyChallenge.pause", targetType: "DailyChallenge", targetId: id, metadata: { reason: reason.reason, status: c.status } });
  return { ok: true };
}

export async function resumeChallenge(id: string, actorId: string, now: Date = new Date()): Promise<ActionResult<{ shiftedMinutes: number }>> {
  const c = await prisma.dailyChallenge.findUnique({ where: { id } });
  if (!c) return fail("Challenge not found.", 404);
  if (!c.pausedAt) return fail("This challenge isn't paused.", 409);

  const shifted = shiftOnResume(c, c.pausedAt, now);
  const shiftedMinutes = Math.round(Math.max(0, now.getTime() - c.pausedAt.getTime()) / 60_000);
  const { count } = await prisma.dailyChallenge.updateMany({
    // Keyed on the pause we read, so a resume racing a second pause cannot shift against the wrong start.
    where: { id, pausedAt: c.pausedAt },
    data: { ...shifted, pausedAt: null, pausedReason: null },
  });
  if (count === 0) return fail("This challenge changed while you were resuming it. Reload and try again.", 409);
  await logAdminAction({ actorId, action: "dailyChallenge.resume", targetType: "DailyChallenge", targetId: id, metadata: { shiftedMinutes } });
  return { ok: true, shiftedMinutes };
}

export async function cancelChallenge(id: string, rawReason: unknown, actorId: string, now: Date = new Date()): Promise<ActionResult<{ refunded: number }>> {
  const reason = reasonFrom(rawReason);
  if (!reason.ok) return reason;
  const c = await prisma.dailyChallenge.findUnique({ where: { id }, select: { status: true, title: true } });
  if (!c) return fail("Challenge not found.", 404);
  if (!isCancellable(c.status)) return fail(c.status === "CANCELLED" ? "This challenge is already cancelled." : "The standings are locked, so this challenge can't be cancelled.", 409);

  const { count } = await prisma.dailyChallenge.updateMany({
    where: { id, status: c.status },
    data: { status: "CANCELLED", cancelledAt: now, cancelledReason: reason.reason },
  });
  if (count === 0) return fail("This challenge changed while you were cancelling it. Reload and try again.", 409);

  // The challenge is cancelled first, which stops anyone entering; the refunds follow, one entry at a time. If
  // any fail (or this request dies half-way) the sweep finishes them — see advanceDailyChallenges.
  const refunds = await refundAllEntries(id, { title: c.title, reason: reason.reason });
  await logAdminAction({
    actorId,
    action: "dailyChallenge.cancel",
    targetType: "DailyChallenge",
    targetId: id,
    metadata: { reason: reason.reason, from: c.status, refunded: refunds.refunded, refundsFailed: refunds.failed } satisfies Prisma.InputJsonValue,
  });
  if (refunds.failed > 0) return fail(`Cancelled, but ${refunds.failed} refund${refunds.failed === 1 ? "" : "s"} didn't go through. The sweep will retry them.`, 500);
  return { ok: true, refunded: refunds.refunded };
}
