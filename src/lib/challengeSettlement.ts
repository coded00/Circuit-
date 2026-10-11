/**
 * Circuit — standings and settlement for a Daily Challenge (docs/daily-challenges-spec.md §11).
 *
 * The decisions — who is where, what is awarded, what the house keeps, whether the books balance — are in
 * challengeResults.ts and challengePrizes.ts and are pure. This file reads the rows those functions need and, at
 * settlement, writes the money through the existing ledger:
 *
 *   each prize → DailyChallengePrizeAward row + wallet credit (CHALLENGE_PRIZE_CREDIT) + escrow row (CHALLENGE_PRIZE)
 *   the rest   → one escrow row to the house (CHALLENGE_HOUSE_REVENUE)
 *   no winner  → every non-disqualified entry refunded, when that is the policy
 *
 * Settlement can run twice, or two of them at once, and pays each prize exactly once: the award row is unique per
 * (challenge, category, player) and every escrow row carries a unique reference, so a repeat inserts nothing (ON CONFLICT
 * DO NOTHING) and credits nothing. The status moves FINALIZED → SETTLING by compare-and-swap, and SETTLING is retried by the
 * sweep if a run died half-way. The books are reconciled — money in against prizes, refunds, platform fees and the house's
 * take — before the challenge is marked COMPLETED; if they don't balance to the kobo the whole transaction rolls back.
 *
 * A challenge funded by a sponsor, or whose prizes are over the auto-approval limit, waits for a named staff approval
 * first, from someone who is neither a winner nor (when a sponsor is involved) the person who created it.
 */

import { prisma } from "@/lib/db";
import { logAdminAction } from "@/lib/auditLog";
import { notify } from "@/lib/notifications";
import { captureException } from "@/lib/observability";
import { refundNoWinnerEntries } from "@/lib/dailyChallengeEntries";
import type { PrizeCategoryInput, SettleEntry } from "@/lib/challengePrizes";
import { buildBoards, describeSettlement, planSettlement, reconcileBooks, type Boards, type RankingRules, type SettlementInput } from "@/lib/challengeResults";
import { leaderboardVisible } from "@/lib/dailyChallenges";

// ---------------------------------------------------------------------------------------------------------
// Reading what the pure functions need
// ---------------------------------------------------------------------------------------------------------

/** Net money the challenge holds: every entry fee taken less every one returned, and the platform's cut booked on top. */
async function ledgerFigures(db: Pick<typeof prisma, "escrowTransaction">, challengeId: string): Promise<{ collected: number; platformFeesBooked: number }> {
  const rows = await db.escrowTransaction.groupBy({ by: ["type"], where: { dailyChallengeId: challengeId, status: "COMPLETE", type: { in: ["CHALLENGE_ENTRY", "CHALLENGE_REFUND", "CHALLENGE_PLATFORM_FEE", "CHALLENGE_PLATFORM_FEE_REVERSAL"] } }, _sum: { amount: true } });
  const sum = (t: string) => rows.find((r) => r.type === t)?._sum.amount ?? 0;
  return { collected: sum("CHALLENGE_ENTRY") - sum("CHALLENGE_REFUND"), platformFeesBooked: sum("CHALLENGE_PLATFORM_FEE") - sum("CHALLENGE_PLATFORM_FEE_REVERSAL") };
}

export type PlayerInfo = { userId: string; displayName: string; handle: string };

export type LoadedChallenge = {
  challenge: NonNullable<Awaited<ReturnType<typeof loadRaw>>>;
  entries: SettleEntry[];
  players: Map<string, PlayerInfo>;
  categories: PrizeCategoryInput[];
  rules: RankingRules;
  verified: number;
  pending: number;
};

async function loadRaw(challengeId: string) {
  return prisma.dailyChallenge.findUnique({
    where: { id: challengeId },
    include: {
      sponsorship: { select: { amountKobo: true } },
      requirements: { orderBy: { sortOrder: "asc" } },
      prizeCategories: { orderBy: { sortOrder: "asc" } },
    },
  });
}

/** The qualified entries — verified by review — as the settlement functions want them, with the rules that rank them. */
export async function loadChallenge(challengeId: string): Promise<LoadedChallenge | null> {
  const challenge = await loadRaw(challengeId);
  if (!challenge) return null;

  const submissions = await prisma.dailyChallengeSubmission.findMany({
    where: { entry: { challengeId }, status: { in: ["VERIFIED", "PENDING"] } },
    include: { entry: { include: { user: { select: { id: true, displayName: true, handle: true } } } }, requirementResults: true },
  });
  const players = new Map<string, PlayerInfo>();
  const entries: SettleEntry[] = [];
  let pending = 0;
  for (const s of submissions) {
    if (s.status === "PENDING") {
      pending++;
      continue;
    }
    // Only an entry still marked VERIFIED qualifies: a disqualification after the fact changes the entry, not the submission.
    if (s.entry.status !== "VERIFIED" || s.verifiedScore === null) continue;
    players.set(s.entry.userId, { userId: s.entry.userId, displayName: s.entry.user.displayName, handle: s.entry.user.handle });
    const targets: Record<string, number> = {};
    const met: Record<string, boolean> = {};
    for (const r of s.requirementResults) {
      if (r.verifiedValue !== null) targets[r.requirementId] = r.verifiedValue;
      if (r.met !== null) met[r.requirementId] = r.met;
    }
    entries.push({ userId: s.entry.userId, score: s.verifiedScore, tiebreakScore: s.verifiedTiebreakScore, targets, met });
  }

  const categories: PrizeCategoryInput[] = challenge.prizeCategories.map((p) => ({
    key: p.id,
    name: p.name,
    amount: p.amountKobo,
    metricKey: p.metricRequirementId,
    place: p.place,
    requires: p.requiresRequirementIds,
    comboOf: p.comboOfCategoryIds,
  }));
  const rules: RankingRules = {
    direction: challenge.direction,
    tiebreakDirection: challenge.tiebreakLabel ? challenge.tiebreakDirection : null,
    targetDirections: Object.fromEntries(challenge.requirements.filter((r) => r.kind === "TARGET").map((r) => [r.id, r.direction ?? "HIGHER"])),
  };
  return { challenge, entries, players, categories, rules, verified: entries.length, pending };
}

async function approvalRules(): Promise<{ autoApprove: boolean; autoApproveMaxKobo: number }> {
  const s = await prisma.platformSetting.findUnique({ where: { id: "singleton" } });
  return { autoApprove: s?.payoutAutoApprove ?? true, autoApproveMaxKobo: s?.payoutAutoApproveMaxKobo ?? 50_000_000 };
}

async function settlementInput(loaded: LoadedChallenge): Promise<SettlementInput> {
  const { challenge } = loaded;
  const [{ collected, platformFeesBooked }, approval] = await Promise.all([ledgerFigures(prisma, challenge.id), approvalRules()]);
  return {
    mode: loaded.categories.length > 0 ? "CATEGORIES" : "RANK_SPLIT",
    categories: loaded.categories,
    split: challenge.prizeSplit,
    entries: loaded.entries,
    rules: loaded.rules,
    collected,
    platformFeesBooked,
    sponsor: challenge.sponsorship?.amountKobo ?? 0,
    noWinnerPolicy: challenge.noWinnerPolicy,
    approval,
  };
}

export type Standings = {
  /** Scores stay hidden until staff have verified them; before that this is empty. */
  visible: boolean;
  boards: Boards | null;
  players: PlayerInfo[];
  verified: number;
  pending: number;
  /** What settlement would pay today (provisional), or paid (final). */
  awards: { categoryKey: string; categoryName: string; userId: string; amount: number }[];
  settled: { awarded: number; house: number; note: string | null } | null;
};

/** Everything the challenge page shows under Standings: every leaderboard, who is winning what, and the settlement once done. */
export async function loadStandings(challengeId: string): Promise<Standings | null> {
  const loaded = await loadChallenge(challengeId);
  if (!loaded) return null;
  const { challenge } = loaded;
  const visible = leaderboardVisible(challenge.status);
  if (!visible) return { visible: false, boards: null, players: [], verified: loaded.verified, pending: loaded.pending, awards: [], settled: null };

  const names = new Map<string, string>([...loaded.categories.map((c) => [c.key, c.name] as [string, string])]);
  let awards: Standings["awards"];
  if (challenge.status === "COMPLETED" || challenge.status === "SETTLING") {
    // What was actually paid.
    const paid = await prisma.dailyChallengePrizeAward.findMany({ where: { challengeId }, orderBy: { createdAt: "asc" } });
    awards = paid.map((a) => ({ categoryKey: a.categoryKey, categoryName: a.categoryName, userId: a.userId, amount: a.amountKobo }));
  } else {
    const plan = planSettlement(await settlementInput(loaded));
    awards = plan.ok ? plan.awards.map((a) => ({ categoryKey: a.categoryKey, categoryName: names.get(a.categoryKey) ?? `Place ${a.categoryKey.replace("place-", "")}`, userId: a.userId, amount: a.amount })) : [];
  }
  const boards = buildBoards({ categories: loaded.categories, entries: loaded.entries, rules: loaded.rules, awards: awards.map((a) => ({ categoryKey: a.categoryKey, userId: a.userId, amount: a.amount })) });
  const settled = challenge.settledAt ? { awarded: challenge.awardedKobo ?? 0, house: challenge.houseKobo ?? 0, note: challenge.settlementNote } : null;
  return { visible, boards, players: [...loaded.players.values()], verified: loaded.verified, pending: loaded.pending, awards, settled };
}

/** What settling would do right now, for the admin page — nothing is written. Null if the challenge doesn't exist. */
export async function previewSettlement(challengeId: string): Promise<{ plan: ReturnType<typeof planSettlement>; description: string | null; approved: boolean; names: Map<string, string> } | null> {
  const loaded = await loadChallenge(challengeId);
  if (!loaded) return null;
  const plan = planSettlement(await settlementInput(loaded));
  const names = new Map(loaded.categories.map((c) => [c.key, c.name] as [string, string]));
  for (const p of loaded.players.values()) names.set(`player:${p.userId}`, p.displayName);
  return { plan, description: plan.ok ? describeSettlement(plan) : null, approved: !!loaded.challenge.payoutApprovedAt, names };
}

// ---------------------------------------------------------------------------------------------------------
// Approval
// ---------------------------------------------------------------------------------------------------------

export type SettleResult =
  | { status: "SETTLED"; awarded: number; house: number; note: string }
  | { status: "WAITING_FOR_APPROVAL" }
  | { status: "NOT_READY" }
  | { status: "ALREADY_SETTLED" }
  | { status: "FAILED"; error: string };

export async function approveChallengePayout(opts: { challengeId: string; actorId: string }): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const loaded = await loadChallenge(opts.challengeId);
  if (!loaded) return { ok: false, error: "Challenge not found.", status: 404 };
  const { challenge } = loaded;
  if (challenge.status !== "FINALIZED") return { ok: false, error: "A payout can only be approved once the standings are final and before it is paid.", status: 409 };
  if (challenge.payoutApprovedAt) return { ok: false, error: "This payout is already approved.", status: 409 };

  const plan = planSettlement(await settlementInput(loaded));
  if (!plan.ok) return { ok: false, error: plan.error, status: 409 };

  // Whoever approves is not a beneficiary of the answer, and — when a sponsor's money is involved — did not create the challenge.
  if (plan.awards.some((a) => a.userId === opts.actorId)) return { ok: false, error: "This payout would pay you a prize, so you can't approve it. Ask another staff member.", status: 403 };
  if ((challenge.sponsorship?.amountKobo ?? 0) > 0 && challenge.createdById === opts.actorId) {
    return { ok: false, error: "You created this sponsored challenge, so you can't approve its payout. Ask another staff member.", status: 403 };
  }

  const { count } = await prisma.dailyChallenge.updateMany({ where: { id: challenge.id, status: "FINALIZED", payoutApprovedAt: null }, data: { payoutApprovedAt: new Date(), payoutApprovedById: opts.actorId } });
  if (count === 0) return { ok: false, error: "Someone else approved this payout first.", status: 409 };
  await logAdminAction({ actorId: opts.actorId, action: "dailyChallenge.approvePayout", targetType: "DailyChallenge", targetId: challenge.id, metadata: { awarded: plan.awarded, houseToBook: plan.houseToBook, sponsor: challenge.sponsorship?.amountKobo ?? 0 } });
  return { ok: true };
}

// ---------------------------------------------------------------------------------------------------------
// Settlement
// ---------------------------------------------------------------------------------------------------------

const prizeRef = (challengeId: string, categoryKey: string, userId: string) => `challenge-prize:${challengeId}:${categoryKey}:${userId}`;
const houseRef = (challengeId: string) => `challenge-house:${challengeId}`;

export async function settleChallenge(opts: { challengeId: string; actorId?: string | null; now?: Date }): Promise<SettleResult> {
  const now = opts.now ?? new Date();
  const first = await prisma.dailyChallenge.findUnique({ where: { id: opts.challengeId }, select: { status: true, payoutApprovedAt: true } });
  if (!first) return { status: "NOT_READY" };
  if (first.status === "COMPLETED") return { status: "ALREADY_SETTLED" };
  if (first.status !== "FINALIZED" && first.status !== "SETTLING") return { status: "NOT_READY" };

  let loaded = await loadChallenge(opts.challengeId);
  if (!loaded) return { status: "NOT_READY" };
  if (loaded.pending > 0) return { status: "FAILED", error: "Some submissions are still waiting for review." };

  const plan = planSettlement(await settlementInput(loaded));
  if (!plan.ok) {
    await prisma.dailyChallenge.update({ where: { id: opts.challengeId }, data: { settlementNote: plan.error.slice(0, 500) } });
    return { status: "FAILED", error: plan.error };
  }
  if (plan.requiresApproval && !first.payoutApprovedAt) return { status: "WAITING_FOR_APPROVAL" };

  // Claim it. A second settlement at the same moment finds nothing to claim and stops; one retrying a SETTLING challenge goes on.
  if (first.status === "FINALIZED") {
    const { count } = await prisma.dailyChallenge.updateMany({ where: { id: opts.challengeId, status: "FINALIZED" }, data: { status: "SETTLING" } });
    if (count === 0) return { status: "ALREADY_SETTLED" };
  }

  try {
    const collectedBefore = (await ledgerFigures(prisma, opts.challengeId)).collected;

    // Nobody qualified and the policy is to give the money back: do it (per entry, outside the big transaction), then re-plan on what is left.
    if (plan.refundAll) {
      const r = await refundNoWinnerEntries(opts.challengeId);
      if (r.failed > 0) return { status: "FAILED", error: `${r.failed} refund${r.failed === 1 ? "" : "s"} didn't go through. It will be retried.` };
      loaded = (await loadChallenge(opts.challengeId)) ?? loaded;
    }
    const figures = await ledgerFigures(prisma, opts.challengeId);
    const refunded = plan.refundAll ? collectedBefore - figures.collected : 0;
    // Whatever is left after a no-winner refund (a disqualified entry's forfeited fee) is the house's.
    const houseToBook = plan.refundAll ? figures.collected - figures.platformFeesBooked : plan.houseToBook;
    const problem = reconcileBooks({ collected: collectedBefore, sponsorUsed: plan.sponsorUsed, awarded: plan.awarded, refunded, houseToBook, platformFeesBooked: figures.platformFeesBooked });
    if (problem) throw new Error(problem);

    const names = new Map(loaded.categories.map((c) => [c.key, c.name] as [string, string]));
    const note = describeSettlement({ ...plan, houseToBook });

    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "DailyChallenge" WHERE id = ${opts.challengeId} FOR UPDATE`;
      const current = await tx.dailyChallenge.findUnique({ where: { id: opts.challengeId }, select: { status: true } });
      if (current?.status !== "SETTLING") throw new Error("This challenge is no longer being settled.");

      for (const a of plan.awards) {
        const categoryName = names.get(a.categoryKey) ?? `Place ${a.categoryKey.replace("place-", "")}`;
        // Inserted with ON CONFLICT DO NOTHING: if this prize was already paid by a run that died after paying it, nothing is inserted and nothing is credited again.
        const made = await tx.dailyChallengePrizeAward.createMany({ data: [{ challengeId: opts.challengeId, categoryKey: a.categoryKey, categoryName, userId: a.userId, amountKobo: a.amount }], skipDuplicates: true });
        if (made.count === 0) continue;
        await tx.user.update({ where: { id: a.userId }, data: { walletBalance: { increment: a.amount } } });
        await tx.escrowTransaction.create({
          data: { dailyChallengeId: opts.challengeId, userId: a.userId, type: "CHALLENGE_PRIZE", amount: a.amount, status: "COMPLETE", providerRef: prizeRef(opts.challengeId, a.categoryKey, a.userId) },
        });
        await tx.walletTransaction.create({ data: { userId: a.userId, type: "CHALLENGE_PRIZE_CREDIT", amount: a.amount, status: "COMPLETE", providerRef: prizeRef(opts.challengeId, a.categoryKey, a.userId) } });
      }
      if (houseToBook > 0) {
        await tx.escrowTransaction.createMany({
          data: [{ dailyChallengeId: opts.challengeId, type: "CHALLENGE_HOUSE_REVENUE", amount: houseToBook, status: "COMPLETE", providerRef: houseRef(opts.challengeId) }],
          skipDuplicates: true,
        });
      }
      await tx.dailyChallenge.update({
        where: { id: opts.challengeId },
        data: { status: "COMPLETED", settledAt: now, collectedKobo: collectedBefore, awardedKobo: plan.awarded, houseKobo: houseToBook, settlementNote: note },
      });
    });

    // Tell people, outside the transaction: a failed notification must never undo a payment.
    const challenge = loaded.challenge;
    const winners = new Set(plan.awards.map((a) => a.userId));
    await Promise.all(
      plan.awards.map((a) => notify(a.userId, "DAILY_CHALLENGE_PRIZE", { challengeId: challenge.id, title: challenge.title, amount: a.amount, category: names.get(a.categoryKey) ?? null }).catch(() => {})),
    );
    const others = await prisma.dailyChallengeEntry.findMany({ where: { challengeId: challenge.id, status: { in: ["VERIFIED", "REJECTED", "SUBMITTED", "ENTERED"] }, userId: { notIn: [...winners] } }, select: { userId: true } });
    await Promise.all(others.map((o) => notify(o.userId, "DAILY_CHALLENGE_RESULT", { challengeId: challenge.id, title: challenge.title, note: plan.refundAll ? "your entry fee was refunded" : "results are final" }).catch(() => {})));

    if (opts.actorId) await logAdminAction({ actorId: opts.actorId, action: "dailyChallenge.settle", targetType: "DailyChallenge", targetId: challenge.id, metadata: { awarded: plan.awarded, houseKobo: houseToBook, refunded, note } });
    return { status: "SETTLED", awarded: plan.awarded, house: houseToBook, note };
  } catch (err) {
    captureException(err, { source: "dailyChallenge:settle", challengeId: opts.challengeId });
    const error = err instanceof Error ? err.message : "Settlement failed.";
    await prisma.dailyChallenge.update({ where: { id: opts.challengeId }, data: { settlementNote: `Settlement didn't complete and will be retried: ${error}`.slice(0, 500) } }).catch(() => {});
    return { status: "FAILED", error };
  }
}

/** The sweep's settlement pass: every challenge that is final, or part-way through settling, that doesn't need a person first. */
export async function settleReadyChallenges(now: Date = new Date(), opts: { only?: string[] } = {}): Promise<{ settled: number; waiting: number; errors: string[] }> {
  const out = { settled: 0, waiting: 0, errors: [] as string[] };
  const ready = await prisma.dailyChallenge.findMany({ where: { status: { in: ["FINALIZED", "SETTLING"] }, ...(opts.only ? { id: { in: opts.only } } : {}) }, select: { id: true }, take: 50 });
  for (const { id } of ready) {
    try {
      const r = await settleChallenge({ challengeId: id, now });
      if (r.status === "SETTLED") out.settled++;
      else if (r.status === "WAITING_FOR_APPROVAL") out.waiting++;
      else if (r.status === "FAILED") out.errors.push(`dailyChallenge:${id}:settle`);
    } catch (err) {
      captureException(err, { source: "sweep:dailyChallengeSettle", challengeId: id });
      out.errors.push(`dailyChallenge:${id}:settle`);
    }
  }
  return out;
}
