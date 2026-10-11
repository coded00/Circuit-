/**
 * Circuit — one Daily Challenge, as a player sees it. Rendered by /battles/[id] when the id is a daily challenge, so a
 * challenge of either kind lives at the same address under Challenges.
 *
 * The rules that matter before paying — how it is scored, what the entry costs and what it can win, the deadlines,
 * the evidence required, how ties are settled, and when money comes back — are all on this page, in the order a
 * player decides in. Nothing on it depends on the viewer being signed in except the entry control.
 *
 * Standings stay hidden until staff have verified them: showing a rival's score while entries are still open would
 * let people enter knowing what to beat.
 */

import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { loginPath } from "@/lib/safeRedirect";
import { loadChallengeSettings } from "@/lib/dailyChallengeSettings";
import { REVIEW_REASON_LABEL, challengePool, describeRequirement, entryRefusal, isReviewReasonCode, leaderboardVisible, submitRefusal, withdrawRefusal } from "@/lib/dailyChallenges";
import { describeSplit } from "@/lib/prizes";
import { noWinnerNotice } from "@/lib/challengeDisclosure";
import { formatNaira, nextDeadline, playerStage } from "@/lib/dailyChallengeView";
import Poller from "@/app/Poller";
import { CountdownTimer } from "@/components/CountdownTimer";
import { GameArtTile } from "@/components/GameArtTile";
import { StatusPill } from "@/components/StatusPill";
import { Panel, PanelBody } from "@/components/ui/Panel";
import { DailyChallengeEntryPanel, type EntryPanelState } from "@/components/DailyChallengeEntryPanel";
import { DailyChallengeSubmitForm } from "@/components/DailyChallengeSubmitForm";
import { ChallengeStandings, type StandingBoardView } from "@/components/ChallengeStandings";
import { DisputeForm } from "@/components/DisputeForm";
import { loadStandings } from "@/lib/challengeSettlement";

function when(date: Date): string {
  return date.toLocaleString("en-NG", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

export async function DailyChallengeDetail({ id }: { id: string }) {
  const user = await getCurrentUser();

  const c = await prisma.dailyChallenge.findUnique({
    where: { id },
    include: {
      sponsorship: { select: { amountKobo: true, source: true } },
      requirements: { orderBy: { sortOrder: "asc" } },
      prizeCategories: { orderBy: { sortOrder: "asc" } },
      _count: { select: { entries: { where: { status: { notIn: ["WITHDRAWN", "REFUNDED"] } } } } },
    },
  });
  if (!c || c.status === "DRAFT") notFound();

  const [settings, myEntry, myName] = await Promise.all([
    loadChallengeSettings(),
    user ? prisma.dailyChallengeEntry.findUnique({ where: { challengeId_userId: { challengeId: id, userId: user.id } } }) : null,
    user ? prisma.userGameName.findUnique({ where: { userId_gameId: { userId: user.id, gameId: c.gameId } }, select: { name: true } }) : null,
  ]);

  const mySubmission = myEntry
    ? await prisma.dailyChallengeSubmission.findUnique({ where: { entryId: myEntry.id }, include: { reviews: { orderBy: { createdAt: "desc" }, take: 1 } } })
    : null;

  const standings = await loadStandings(c.id);
  const myDispute = mySubmission ? await prisma.dailyChallengeDispute.findFirst({ where: { submissionId: mySubmission.id }, orderBy: { createdAt: "desc" } }) : null;

  const now = new Date();
  const stage = playerStage(c, now);
  const deadline = nextDeadline(c, now);
  const entered = c._count.entries;
  const sponsor = c.sponsorship?.amountKobo ?? 0;
  const pool = challengePool({ entryFee: c.entryFee, platformFeeBps: c.platformFeeBps, entryCount: entered, sponsorKobo: sponsor });
  const full = challengePool({ entryFee: c.entryFee, platformFeeBps: c.platformFeeBps, entryCount: c.maxEntrants, sponsorKobo: sponsor });
  const categoryPrizes = c.prizeCategories.length > 0;
  const prizeTotal = c.prizeCategories.reduce((sum, p) => sum + p.amountKobo, 0);
  const hasPrize = categoryPrizes ? prizeTotal > 0 : full.prizePool > 0;
  const needsRecording = c.requireRecording || c.kind === "WEAPON" || c.scoreNeedsRecording;
  const noWinner = noWinnerNotice({ policy: c.noWinnerPolicy, hasMandatoryTarget: c.minScore !== null || c.requirements.some((r) => r.gate), entryFee: c.entryFee });
  const nameById = new Map(c.requirements.map((r) => [r.id, r.label]));
  const catName = new Map(c.prizeCategories.map((p) => [p.id, p.name]));

  // What this viewer can do right now, decided from the same rules the server enforces.
  let panel: EntryPanelState;
  const isIn = !!myEntry && myEntry.status !== "WITHDRAWN" && myEntry.status !== "REFUNDED";
  if (!user) {
    panel = { kind: "signed-out", loginHref: loginPath(`/battles/${id}`) };
  } else if (isIn) {
    const w = withdrawRefusal({ challenge: c, entryStatus: myEntry!.status, now });
    panel = { kind: "entered", canWithdraw: !w, withdrawBlocked: w?.message };
  } else {
    const refusal = entryRefusal({ challenge: c, activeEntryCount: entered, alreadyEntered: false, enabled: settings.enabled, maxEntryFeeKobo: settings.maxEntryFeeKobo, now });
    panel = refusal ? { kind: "blocked", message: refusal.message } : { kind: "can-enter" };
  }

  // The standings as the table wants them: names resolved, kobo formatted, the viewer marked.
  const players = new Map((standings?.players ?? []).map((p) => [p.userId, p]));
  const targetLabel = new Map(c.requirements.map((r) => [r.id, r.label]));
  const view = (rows: NonNullable<typeof standings>["boards"] extends infer B ? (B extends { overall: infer R } ? R : never) : never): StandingBoardView["rows"] =>
    rows.map((r) => ({ rank: r.rank, name: players.get(r.userId)?.displayName ?? "Player", handle: players.get(r.userId)?.handle ?? "", value: String(r.value), winner: r.winner, prize: r.prize > 0 ? formatNaira(r.prize) : null, me: r.userId === user?.id }));
  const boardViews: StandingBoardView[] = standings?.boards
    ? [
        { key: "overall", name: "Overall", prize: null, metricLabel: c.metricLabel, combined: false, rows: view(standings.boards.overall) },
        ...standings.boards.categories.map((cat) => {
          const source = c.prizeCategories.find((p) => p.id === cat.key);
          return { key: cat.key, name: cat.name, prize: formatNaira(cat.amount), metricLabel: source?.metricRequirementId ? (targetLabel.get(source.metricRequirementId) ?? c.metricLabel) : c.metricLabel, combined: cat.combined, rows: view(cat.rows) };
        }),
      ]
    : [];
  const myPrizes = (standings?.awards ?? []).filter((a) => a.userId === user?.id);
  const myPrizeTotal = myPrizes.reduce((sum, a) => sum + a.amount, 0);
  const windowEndsAt = c.provisionalAt ? new Date(c.provisionalAt.getTime() + c.disputeWindowMinutes * 60_000) : null;
  const minutesLeft = windowEndsAt ? Math.ceil((windowEndsAt.getTime() - now.getTime()) / 60_000) : 0;
  const canDispute = c.status === "PROVISIONAL" && !!mySubmission && mySubmission.status !== "PENDING" && minutesLeft > 0 && myDispute?.status !== "OPEN";

  const canSubmit = !!user && !!myEntry && !submitRefusal({ challenge: c, entryStatus: myEntry.status, hasSubmission: !!mySubmission, now });
  const lastReview = mySubmission?.reviews[0] ?? null;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-6 sm:px-8 sm:py-10">
      <Poller />
      <Link href="/battles" className="inline-flex w-fit items-center gap-1 text-sm font-medium text-muted transition hover:text-foreground">
        <ChevronLeft size={16} /> Challenges
      </Link>

      <header className="relative isolate overflow-hidden cut-lg border border-border bg-black text-white">
        <div className="relative aspect-[4/1] w-full overflow-hidden">
          <GameArtTile game={c.gameName} className="h-full w-full" hideLabel imgWidth={1280} fill />
          <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
        </div>
        <div className="flex flex-col gap-2 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[11px] tracking-wide text-white/70 uppercase">
              {c.gameName}
              {c.modeName ? ` · ${c.modeName}` : ""} · {c.kind === "WEAPON" ? "Weapon challenge" : c.kind === "SKILL" ? "Skill challenge" : c.kind === "COMBINED" ? "Combined challenge" : "Daily"}
              {c.weaponLabel ? ` · ${c.weaponLabel}` : ""}
            </span>
            <StatusPill tone={stage.tone} pulse={stage.pulse} solid>
              {stage.label}
            </StatusPill>
          </div>
          <h1 className="font-display text-2xl leading-[1.02] font-bold tracking-tight uppercase sm:text-4xl">{c.title}</h1>
          {deadline && (
            <p className="text-sm text-white/80">
              {deadline.label} <CountdownTimer target={deadline.at.toISOString()} zeroLabel="now" />
            </p>
          )}
        </div>
      </header>

      {c.status === "CANCELLED" && (
        <p className="border border-border bg-surface-elevated px-4 py-3 text-sm">
          <strong>Cancelled.</strong> {c.cancelledReason}
          {c.entryFee > 0 ? " Every entry fee was refunded to the wallet it came from." : ""}
        </p>
      )}
      {c.pausedAt && c.status !== "CANCELLED" && (
        <p className="border border-border bg-surface-elevated px-4 py-3 text-sm">
          <strong>Paused.</strong> {c.pausedReason} Deadlines still ahead move later by the length of the pause.
        </p>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_340px]">
        <div className="flex flex-col gap-6">
          {canSubmit && (
            <Panel title="Submit your score">
              <PanelBody>
                <DailyChallengeSubmitForm
                  challengeId={c.id}
                  metricLabel={c.metricLabel}
                  metricUnit={c.metricUnit}
                  tiebreakLabel={c.tiebreakLabel}
                  requireRecording={c.requireRecording}
                  requirements={c.requirements.map((r) => ({ id: r.id, kind: r.kind, text: describeRequirement(r), unit: r.unit }))}
                />
              </PanelBody>
            </Panel>
          )}

          {mySubmission && (
            <Panel title="Your submission">
              <PanelBody className="flex flex-col gap-2 text-sm">
                {mySubmission.status === "PENDING" && (
                  <p>
                    <strong>Submitted, waiting for review.</strong> You claimed {mySubmission.score} {c.metricLabel.toLowerCase()}. Staff are checking it against your screenshot.
                  </p>
                )}
                {mySubmission.status === "VERIFIED" && (
                  <p>
                    <strong className="text-success">Verified:</strong> {mySubmission.verifiedScore} {c.metricLabel.toLowerCase()}
                    {mySubmission.verifiedScore !== mySubmission.score ? ` (you claimed ${mySubmission.score}; staff corrected it from the evidence)` : ""}. Standings appear once all scores are verified.
                  </p>
                )}
                {mySubmission.status === "REJECTED" && (
                  <p>
                    <strong className="text-danger">Not accepted.</strong>{" "}
                    {isReviewReasonCode(lastReview?.reasonCode) ? `${REVIEW_REASON_LABEL[lastReview.reasonCode]}.` : ""} {lastReview?.note ?? ""}
                  </p>
                )}
                <a href={`/api/daily-challenges/submissions/${mySubmission.id}/evidence`} target="_blank" rel="noreferrer" className="text-xs underline">
                  View the screenshot you uploaded
                </a>
              </PanelBody>
            </Panel>
          )}

          <Panel title="How it works">
            <PanelBody className="flex flex-col gap-4 text-sm">
              <div>
                <p className="text-xs text-muted uppercase">Which match counts</p>
                <p className="whitespace-pre-wrap">{c.rules}</p>
              </div>
              <div>
                <p className="text-xs text-muted uppercase">Scoring</p>
                <p>
                  Your score is your {c.metricLabel.toLowerCase()}
                  {c.metricUnit ? ` (${c.metricUnit})` : ""}. The {c.direction === "HIGHER" ? "highest" : "lowest"} verified score wins.
                  {c.tiebreakLabel ? ` Ties go to the ${c.tiebreakDirection === "HIGHER" ? "highest" : "lowest"} ${c.tiebreakLabel.toLowerCase()}.` : ""} {c.tiebreakRule}
                </p>
              </div>
              {c.requirements.length > 0 && (
                <div>
                  <p className="text-xs text-muted uppercase">To qualify, these have to be met</p>
                  <ul className="mt-1 flex flex-col gap-1">
                    {c.requirements.map((r) => (
                      <li key={r.id} className="flex items-start gap-2">
                        <span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0 bg-accent-volt" />
                        <span>
                          {describeRequirement(r)}
                          {!r.gate && <span className="text-xs text-muted"> (only for the prizes that need it)</span>}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-1 text-xs text-muted">Staff check each one against your evidence. An entry that misses one isn&apos;t ranked, and the fee isn&apos;t returned.</p>
                </div>
              )}
              <div>
                <p className="text-xs text-muted uppercase">Evidence</p>
                <p>
                  {c.evidenceRequirements}
                  {needsRecording ? " A continuous screen recording is required: start it by showing your entry code (below the entry button), then open the game." : ""} Staff
                  compare it with the in-game name you entered with. Results are checked by Circuit staff from your evidence, not verified by the game&apos;s publisher.
                </p>
              </div>
            </PanelBody>
          </Panel>

          {categoryPrizes && (
            <Panel title="Prizes">
              <PanelBody className="flex flex-col gap-3 text-sm">
                <ul className="flex flex-col divide-y divide-border">
                  {c.prizeCategories.map((p) => {
                    const isCombo = p.comboOfCategoryIds.length > 0;
                    const how = isCombo
                      ? `Won by the player who wins ${p.comboOfCategoryIds.map((k) => `"${catName.get(k) ?? "?"}"`).join(" and ")}. That player gets this instead of those separate prizes.`
                      : `${p.place === 1 ? "The best" : `The ${p.place}${p.place === 2 ? "nd" : p.place === 3 ? "rd" : "th"} best`} ${p.metricRequirementId ? (nameById.get(p.metricRequirementId) ?? "result").toLowerCase() : c.metricLabel.toLowerCase()}${p.requiresRequirementIds.length > 0 ? `, among players who ${p.requiresRequirementIds.map((k) => (nameById.get(k) ?? "").toLowerCase()).join(" and ")}` : ""}.`;
                    return (
                      <li key={p.id} className="flex items-start justify-between gap-4 py-2 first:pt-0 last:pb-0">
                        <div className="flex min-w-0 flex-col">
                          <span className="font-medium">{p.name}</span>
                          <span className="text-xs text-muted">{how}</span>
                        </div>
                        <span className="shrink-0 font-display text-lg font-bold text-gold">{formatNaira(p.amountKobo)}</span>
                      </li>
                    );
                  })}
                </ul>
                <p className="text-xs text-muted">
                  Prizes are fixed amounts. If entries are level for a prize, they share it equally. A prize nobody qualifies for isn&apos;t awarded, and money that isn&apos;t
                  awarded is kept by Circuit.
                </p>
              </PanelBody>
            </Panel>
          )}

          <Panel title="Timeline">
            <PanelBody>
              <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                <div><dt className="text-xs text-muted">Entries open</dt><dd>{when(c.entryOpensAt)}</dd></div>
                <div><dt className="text-xs text-muted">Entries close</dt><dd>{when(c.entryClosesAt)}</dd></div>
                <div><dt className="text-xs text-muted">Play your match between</dt><dd>{when(c.windowStartsAt)} and {when(c.windowEndsAt)}</dd></div>
                <div><dt className="text-xs text-muted">Submit your score by</dt><dd>{when(c.submissionsCloseAt)}</dd></div>
              </dl>
            </PanelBody>
          </Panel>

          <Panel title="Money, refunds and disputes">
            <PanelBody className="flex flex-col gap-2 text-sm text-muted">
              <p>
                {c.entryFee === 0
                  ? "Entry is free."
                  : categoryPrizes
                    ? `Entry is ${formatNaira(c.entryFee)}, taken from your wallet. The prizes above are fixed amounts; everything collected that isn't awarded is kept by Circuit.`
                    : `Entry is ${formatNaira(c.entryFee)}, taken from your wallet. Circuit keeps ${(c.platformFeeBps / 100).toFixed(2).replace(/\.00$/, "")}% of each fee; the rest goes into the prize pool.`}
              </p>
              {noWinner && <p className="font-medium text-foreground">{noWinner}</p>}
              <p>You can withdraw for a full refund until the match window starts. If the challenge is cancelled — including when fewer than {c.minEntrants} players enter — every entry is refunded.</p>
              <p>If you enter and don&apos;t submit a score, the entry fee isn&apos;t returned.</p>
              <p>Provisional results stay open to disputes for {c.disputeWindowMinutes} minutes before they&apos;re final.</p>
            </PanelBody>
          </Panel>

          <Panel title="Standings">
            <PanelBody className="flex flex-col gap-4 text-sm">
              {c.status === "PROVISIONAL" && (
                <p className="text-muted">
                  <strong className="text-foreground">Provisional.</strong> These become final in about {Math.max(1, minutesLeft)} minute{minutesLeft === 1 ? "" : "s"} unless a decision is disputed.
                  Prizes are paid once they&apos;re final.
                </p>
              )}
              {standings?.settled && (
                <p className="text-muted">
                  <strong className="text-foreground">Settled.</strong> {standings.settled.note}
                </p>
              )}
              {myPrizeTotal > 0 && (
                <p className="border border-accent-volt/40 bg-accent-volt/10 px-3 py-2">
                  {c.status === "COMPLETED" ? "You won" : "You're currently winning"} <strong>{formatNaira(myPrizeTotal)}</strong> — {myPrizes.map((a) => a.categoryName).join(", ")}.
                  {c.status === "COMPLETED" ? " It's in your wallet." : ""}
                </p>
              )}
              {boardViews.length > 0 && boardViews[0].rows.length > 0 ? (
                <ChallengeStandings boards={boardViews} />
              ) : leaderboardVisible(c.status) ? (
                <p className="text-muted">Nobody qualified.</p>
              ) : (
                <p className="text-muted">Scores stay hidden until staff have verified them, so nobody enters knowing what to beat.</p>
              )}
              {canDispute && <DisputeForm challengeId={c.id} minutesLeft={minutesLeft} />}
              {myDispute && (
                <p className="text-xs text-muted">
                  Your dispute: <strong className="text-foreground">{myDispute.status === "OPEN" ? "waiting for a reviewer" : myDispute.status === "UPHELD" ? "upheld — your submission was sent back for a fresh decision" : "dismissed"}</strong>
                  {myDispute.ruling ? ` — ${myDispute.ruling}` : ""}
                </p>
              )}
            </PanelBody>
          </Panel>
        </div>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-6 lg:self-start">
          <section className="card flex flex-col gap-4 p-5">
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col">
                <span className="text-xs text-muted uppercase">{!hasPrize ? "Prize" : categoryPrizes ? "Prizes total" : entered === 0 ? "Prize pool up to" : "Prize pool"}</span>
                <span className="font-display text-2xl leading-tight font-bold text-gold">
                  {!hasPrize ? "—" : formatNaira(categoryPrizes ? prizeTotal : entered === 0 ? full.prizePool : pool.prizePool)}
                </span>
                {categoryPrizes && hasPrize && <span className="text-xs text-muted">fixed amounts</span>}
                {!categoryPrizes && hasPrize && entered > 0 && entered < c.maxEntrants && <span className="text-xs text-muted">up to {formatNaira(full.prizePool)} when full</span>}
              </div>
              <div className="flex flex-col">
                <span className="text-xs text-muted uppercase">Entry</span>
                <span className="font-display text-2xl leading-tight font-bold">{c.entryFee === 0 ? "Free" : formatNaira(c.entryFee)}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-xs text-muted uppercase">Players</span>
                <span className="font-display text-lg font-bold">{entered} / {c.maxEntrants}</span>
                <span className="text-xs text-muted">{c.minEntrants} needed to run</span>
              </div>
              <div className="flex flex-col">
                <span className="text-xs text-muted uppercase">{categoryPrizes ? "Prizes" : "Paid places"}</span>
                <span className="text-sm font-medium">{categoryPrizes ? `${c.prizeCategories.length} categor${c.prizeCategories.length === 1 ? "y" : "ies"}` : hasPrize ? describeSplit(c.prizeSplit) : "None"}</span>
                {sponsor > 0 && <span className="text-xs text-muted">Sponsored: {c.sponsorship?.source}</span>}
              </div>
            </div>
            <div className="border-t border-border pt-4">
              <DailyChallengeEntryPanel
                challengeId={c.id}
                entryFee={c.entryFee}
                balance={user?.walletBalance ?? 0}
                gameName={c.gameName}
                hasInGameName={!!myName?.name.trim()}
                state={panel}
                acknowledge={noWinner}
                entryCode={isIn && needsRecording ? (myEntry?.verificationCode ?? null) : null}
              />
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
