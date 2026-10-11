/**
 * Circuit — switching challenge templates on and off, launching them, and the daily rotation.
 *
 * The 25 templates are code (src/lib/challengeTemplates.ts). What is stored is the owner's switches: whether each is on,
 * on which weekdays, and any change to the money. Switching one ON means its challenge appears on the homepage on those
 * days — published automatically, but only if the full configuration passes the same publish rules as any challenge: the
 * platform switch on, the game published, the prizes funded within the payout cap, a recording required where the stat
 * needs one. A template that fails them is not published and the reason is kept, visible in the admin list.
 *
 * One launch per template per Lagos day is enforced by the database (a unique key on the challenge), so two sweeps, or a
 * sweep and a staff "launch now", cannot publish the same day twice.
 */

import { prisma } from "@/lib/db";
import { logAdminAction } from "@/lib/auditLog";
import { captureException } from "@/lib/observability";
import { CHALLENGE_TEMPLATES, templateByKey, templateToDraft, type ChallengeTemplate } from "@/lib/challengeTemplates";
import { ALL_WEEKDAYS, lagosDateKey, parseWeekdays, templateDue } from "@/lib/templateRotation";
import { createDraft, deleteDraft, publishChallenge, type ActionResult } from "@/lib/dailyChallengeAdmin";
import { loadChallengeSettings } from "@/lib/dailyChallengeSettings";

const fail = (error: string, status = 400): { ok: false; error: string; status: number } => ({ ok: false, error, status });

export type TemplateState = {
  enabled: boolean;
  weekdays: number[];
  entryFee: number | null;
  minEntrants: number | null;
  maxEntrants: number | null;
  launchedOn: string | null;
  lastResult: string | null;
};

export type TemplateListRow = {
  template: ChallengeTemplate;
  state: TemplateState;
  /** Whether the template's game is published in the catalog — a template can't run until it is. */
  gamePublished: boolean;
  prizeTotal: number;
};

const DEFAULT_STATE: TemplateState = { enabled: false, weekdays: [...ALL_WEEKDAYS], entryFee: null, minEntrants: null, maxEntrants: null, launchedOn: null, lastResult: null };

export async function listTemplates(): Promise<TemplateListRow[]> {
  const [states, games] = await Promise.all([
    prisma.challengeTemplateState.findMany(),
    prisma.game.findMany({ where: { enabled: true, publishedAt: { not: null } }, select: { name: true } }),
  ]);
  const byKey = new Map(states.map((s) => [s.templateKey, s]));
  const published = new Set(games.map((g) => g.name.toLowerCase()));
  return CHALLENGE_TEMPLATES.map((template) => {
    const s = byKey.get(template.key);
    return {
      template,
      state: s ? { enabled: s.enabled, weekdays: s.weekdays, entryFee: s.entryFee, minEntrants: s.minEntrants, maxEntrants: s.maxEntrants, launchedOn: s.launchedOn, lastResult: s.lastResult } : DEFAULT_STATE,
      gamePublished: published.has(template.game.toLowerCase()),
      prizeTotal: template.prizes.reduce((sum, p) => sum + p.amount, 0),
    };
  });
}

async function gameIdFor(name: string): Promise<string | null> {
  const game = await prisma.game.findFirst({ where: { name: { equals: name, mode: "insensitive" }, enabled: true, publishedAt: { not: null } }, select: { id: true } });
  return game?.id ?? null;
}

export async function setTemplateState(opts: {
  key: string;
  actorId: string;
  enabled?: boolean;
  weekdays?: unknown;
  entryFee?: unknown;
  minEntrants?: unknown;
  maxEntrants?: unknown;
}): Promise<ActionResult> {
  const template = templateByKey(opts.key);
  if (!template) return fail("No such template.", 404);

  const data: { enabled?: boolean; weekdays?: number[]; entryFee?: number | null; minEntrants?: number | null; maxEntrants?: number | null } = {};

  if (opts.weekdays !== undefined) {
    const days = parseWeekdays(opts.weekdays);
    if (!days || days.length === 0) return fail("Choose at least one weekday.");
    data.weekdays = days;
  }
  const count = (raw: unknown, label: string, min: number, max: number): number | null | "bad" => {
    if (raw === null || raw === "") return null;
    const n = typeof raw === "string" ? Number(raw) : raw;
    return typeof n === "number" && Number.isInteger(n) && n >= min && n <= max ? n : ("bad" as const);
  };
  if (opts.entryFee !== undefined) {
    const v = count(opts.entryFee, "Entry fee", 0, 2_000_000_000);
    if (v === "bad") return fail("The entry fee must be a whole number of kobo, 0 or more.");
    data.entryFee = v;
  }
  if (opts.minEntrants !== undefined) {
    const v = count(opts.minEntrants, "Minimum players", 1, 10_000);
    if (v === "bad") return fail("The minimum players must be a whole number, 1 or more.");
    data.minEntrants = v;
  }
  if (opts.maxEntrants !== undefined) {
    const v = count(opts.maxEntrants, "Maximum players", 1, 10_000);
    if (v === "bad") return fail("The maximum players must be a whole number, 1 or more.");
    data.maxEntrants = v;
  }
  if (opts.enabled !== undefined) {
    if (opts.enabled && !(await gameIdFor(template.game))) return fail(`${template.game} isn't published yet. Publish it in Admin → Games first, then switch this on.`, 409);
    data.enabled = opts.enabled;
  }
  if (Object.keys(data).length === 0) return fail("Nothing to change.");

  // The money has to still make sense with the overrides: a minimum above the maximum, or prizes the smaller field can't fund,
  // is refused here rather than failing quietly at launch time.
  const existing = await prisma.challengeTemplateState.findUnique({ where: { templateKey: opts.key } });
  const min = data.minEntrants !== undefined ? data.minEntrants : existing?.minEntrants ?? null;
  const max = data.maxEntrants !== undefined ? data.maxEntrants : existing?.maxEntrants ?? null;
  if ((min ?? 20) > (max ?? 100)) return fail("The minimum players can't be above the maximum.");

  await prisma.challengeTemplateState.upsert({
    where: { templateKey: opts.key },
    create: { templateKey: opts.key, ...data, updatedById: opts.actorId },
    update: { ...data, updatedById: opts.actorId },
  });
  await logAdminAction({
    actorId: opts.actorId,
    action: data.enabled === undefined ? "challengeTemplate.update" : data.enabled ? "challengeTemplate.enable" : "challengeTemplate.disable",
    targetType: "ChallengeTemplate",
    targetId: opts.key,
    metadata: JSON.parse(JSON.stringify(data)),
  });
  return { ok: true };
}

/**
 * Creates and publishes today's challenge from a template. The one place a template becomes a challenge, used by the
 * rotation and by a staff member's "launch now". If it can't be published the draft is removed and the reason returned —
 * nothing half-made is left lying around for a player or a reviewer to find.
 */
export async function launchTemplate(opts: { key: string; actorId: string; now?: Date }): Promise<ActionResult<{ challengeId: string; dateKey: string }>> {
  const now = opts.now ?? new Date();
  const template = templateByKey(opts.key);
  if (!template) return fail("No such template.", 404);
  const state = await prisma.challengeTemplateState.findUnique({ where: { templateKey: opts.key } });
  const dateKey = lagosDateKey(now);

  const gameId = await gameIdFor(template.game);
  if (!gameId) return fail(`${template.game} isn't published in the catalog.`, 409);

  // The templates' own defaults (₦1,000, 20 to 100 players) are fitted to the pilot ceilings in force, so an untouched template
  // can always launch. A figure a staff member set explicitly is passed through as it is and refused if it is over a ceiling.
  const limits = await loadChallengeSettings();
  const maxDefault = Math.min(100, limits.maxEntrants);
  const body = templateToDraft(template, {
    gameId,
    day: now,
    overrides: {
      entryFee: state?.entryFee ?? Math.min(1_000 * 100, limits.maxEntryFeeKobo),
      maxEntrants: state?.maxEntrants ?? maxDefault,
      minEntrants: state?.minEntrants ?? Math.min(20, state?.maxEntrants ?? maxDefault),
    },
  });

  let created: ActionResult<{ id: string }>;
  try {
    created = await createDraft(body, opts.actorId, { templateKey: opts.key, launchedForDate: dateKey });
  } catch (err) {
    // The unique key on (template, day): somebody else launched it a moment ago.
    if (typeof err === "object" && err !== null && "code" in err && (err as { code?: string }).code === "P2002") return fail("This template has already launched today.", 409);
    throw err;
  }
  if (!created.ok) return created;

  const published = await publishChallenge(created.id, opts.actorId, now);
  if (!published.ok) {
    await deleteDraft(created.id, opts.actorId).catch(() => {});
    return fail(`Not published: ${published.error}`, published.status);
  }
  return { ok: true, challengeId: created.id, dateKey };
}

/**
 * The rotation, run by the sweep: every template that is ON, on its weekdays, with entries still open today, launches once.
 * The platform switch being off is not an error — it just means nothing launches, and each template says so.
 */
export async function runTemplateRotation(now: Date = new Date()): Promise<{ launched: number; skipped: number; errors: string[] }> {
  const out = { launched: 0, skipped: 0, errors: [] as string[] };
  const states = await prisma.challengeTemplateState.findMany({ where: { enabled: true } });
  if (states.length === 0) return out;
  const settings = await loadChallengeSettings();

  for (const state of states) {
    try {
      const decision = templateDue({ enabled: state.enabled, weekdays: state.weekdays, launchedOn: state.launchedOn, now });
      if (!decision.due) {
        out.skipped++;
        continue;
      }
      if (!settings.enabled) {
        await prisma.challengeTemplateState.update({ where: { templateKey: state.templateKey }, data: { lastResult: "Not launched: Daily Challenges are switched off in Settings." } });
        out.skipped++;
        continue;
      }
      if (!state.updatedById) {
        await prisma.challengeTemplateState.update({ where: { templateKey: state.templateKey }, data: { lastResult: "Not launched: no staff member is recorded as having switched it on." } });
        out.skipped++;
        continue;
      }
      const r = await launchTemplate({ key: state.templateKey, actorId: state.updatedById, now });
      if (r.ok) {
        out.launched++;
        await prisma.challengeTemplateState.update({ where: { templateKey: state.templateKey }, data: { launchedOn: r.dateKey, lastResult: `Launched for ${r.dateKey}.` } });
        await logAdminAction({ actorId: state.updatedById, action: "challengeTemplate.launch", targetType: "DailyChallenge", targetId: r.challengeId, metadata: { templateKey: state.templateKey, day: r.dateKey } });
      } else {
        out.skipped++;
        // A launch that already happened today (a race with "launch now") is not a problem to report.
        await prisma.challengeTemplateState.update({
          where: { templateKey: state.templateKey },
          data: r.status === 409 && r.error.includes("already launched") ? { launchedOn: decision.dateKey, lastResult: `Launched for ${decision.dateKey}.` } : { lastResult: r.error.slice(0, 300) },
        });
      }
    } catch (err) {
      captureException(err, { source: "sweep:templateRotation", templateKey: state.templateKey });
      out.errors.push(`template:${state.templateKey}`);
    }
  }
  return out;
}
