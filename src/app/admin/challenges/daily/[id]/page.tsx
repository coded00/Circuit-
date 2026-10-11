/**
 * Circuit — Admin: one Daily Challenge. What it is, the money at stake, the timeline, and the staff actions
 * its state allows. Entries, evidence review and results are added here as those steps are built.
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { worstCasePayout } from "@/lib/challengePrizes";
import { challengePool, describeRequirement, isCancellable, isEditable, isPausable } from "@/lib/dailyChallenges";
import { describeSplit } from "@/lib/prizes";
import { loadChallengeSettings } from "@/lib/dailyChallengeSettings";
import { reviewQueueCounts } from "@/lib/dailyChallengeSubmissions";
import { KeyValue, naira, PageHeader, Panel, Section } from "@/components/admin/ui";
import { DailyChallengeStatusBadge } from "@/components/admin/DailyChallengeStatusBadge";
import { DailyChallengeActions } from "@/components/admin/DailyChallengeActions";
import { SettlementActions } from "@/components/admin/SettlementActions";
import { previewSettlement } from "@/lib/challengeSettlement";

function formatDate(date: Date | null): string {
  return date ? date.toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" }) : "—";
}

export default async function AdminDailyChallengePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [c, settings] = await Promise.all([
    prisma.dailyChallenge.findUnique({
      where: { id },
      include: {
        createdBy: { select: { displayName: true, handle: true } },
        sponsorship: { select: { amountKobo: true, source: true } },
        requirements: { orderBy: { sortOrder: "asc" } },
        prizeCategories: { orderBy: { sortOrder: "asc" } },
        _count: { select: { entries: { where: { status: { notIn: ["WITHDRAWN", "REFUNDED"] } } } } },
      },
    }),
    loadChallengeSettings(),
  ]);
  if (!c) notFound();

  const pending = await reviewQueueCounts(id).then((r) => r.pending);
  const showSettlement = ["PROVISIONAL", "FINALIZED", "SETTLING", "COMPLETED"].includes(c.status);
  const preview = showSettlement && c.status !== "COMPLETED" ? await previewSettlement(id) : null;
  const paid = c.status === "COMPLETED" ? await prisma.dailyChallengePrizeAward.findMany({ where: { challengeId: id }, orderBy: { createdAt: "asc" }, include: { user: { select: { displayName: true, handle: true } } } }) : [];
  const approvedBy = c.payoutApprovedById ? await prisma.user.findUnique({ where: { id: c.payoutApprovedById }, select: { displayName: true } }) : null;
  const planAwards = preview?.plan.ok ? preview.plan.awards : [];
  const planUsers = planAwards.length ? await prisma.user.findMany({ where: { id: { in: [...new Set(planAwards.map((a) => a.userId))] } }, select: { id: true, displayName: true, handle: true } }) : [];
  const userName = new Map(planUsers.map((u) => [u.id, `${u.displayName} (@${u.handle})`]));
  const needsApproval = !!preview?.plan.ok && preview.plan.requiresApproval;
  const sponsor = c.sponsorship?.amountKobo ?? 0;
  const categoryMode = c.prizeCategories.length > 0;
  const prizeTotal = worstCasePayout(c.prizeCategories.map((p) => ({ amount: p.amountKobo })));
  const reqName = new Map(c.requirements.map((r) => [r.id, r.label]));
  const catName = new Map(c.prizeCategories.map((p) => [p.id, p.name]));
  const atMin = challengePool({ entryFee: c.entryFee, platformFeeBps: c.platformFeeBps, entryCount: c.minEntrants, sponsorKobo: sponsor });
  const atMax = challengePool({ entryFee: c.entryFee, platformFeeBps: c.platformFeeBps, entryCount: c.maxEntrants, sponsorKobo: sponsor });
  const now = new Date();
  const feeNote = c.status === "DRAFT" ? `${(settings.platformFeeBps / 100).toFixed(2)}% now, fixed at publish` : `${(c.platformFeeBps / 100).toFixed(2)}%`;

  return (
    <>
      <PageHeader
        title={c.title}
        back={{ href: "/admin/challenges?kind=daily", label: "Challenges" }}
        meta={
          <>
            <DailyChallengeStatusBadge status={c.status} paused={!!c.pausedAt} />
            <span>{c.gameName}{c.modeName ? ` · ${c.modeName}` : ""}{c.kind !== "STANDARD" ? ` · ${c.kind.toLowerCase()}${c.weaponLabel ? ` (${c.weaponLabel})` : ""}` : ""}</span>
            <span>Created by {c.createdBy.displayName}</span>
          </>
        }
        actions={
          <>
            {isEditable(c.status) && (
              <Link href={`/admin/challenges/daily/${c.id}/edit`} className="btn-secondary text-sm">
                Edit
              </Link>
            )}
            <DailyChallengeActions id={c.id} status={c.status} paused={!!c.pausedAt} canPause={isPausable(c.status)} canCancel={isCancellable(c.status)} enabled={settings.enabled} />
          </>
        }
      />

      {c.pausedAt && (
        <Panel>
          <p className="text-[13px] text-foreground">
            <strong>Paused</strong> since {formatDate(c.pausedAt)}. {c.pausedReason}
          </p>
          <p className="mt-1 text-[12px] text-muted">Nobody can enter or submit, and the clock isn&apos;t advancing. Resuming moves deadlines still ahead later by the length of the pause.</p>
        </Panel>
      )}
      {c.status === "CANCELLED" && (
        <Panel>
          <p className="text-[13px] text-foreground">
            <strong>Cancelled</strong> {formatDate(c.cancelledAt)}. {c.cancelledReason}
          </p>
        </Panel>
      )}

      <Section title="Money">
        <Panel>
          <KeyValue
            items={[
              { label: "Entry fee", value: c.entryFee === 0 ? "Free" : naira(c.entryFee) },
              { label: "Players", value: `${c._count.entries} entered · ${c.minEntrants} minimum · ${c.maxEntrants} maximum` },
              ...(categoryMode
                ? [
                    { label: "Prizes (fixed, worst case)", value: naira(prizeTotal) },
                    { label: "Entries at the minimum field", value: naira(c.entryFee * c.minEntrants) },
                    { label: `Most that can be promised (${settings.maxPayoutBps / 100}%)`, value: naira(Math.floor((c.entryFee * c.minEntrants * settings.maxPayoutBps) / 10_000) + sponsor) },
                    { label: "House keeps if every prize is won", value: `${naira(Math.max(0, c.entryFee * c.minEntrants - prizeTotal))} at the minimum · ${naira(Math.max(0, c.entryFee * c.maxEntrants - prizeTotal))} when full` },
                    { label: "If nobody qualifies", value: c.noWinnerPolicy === "HOUSE_KEEPS" ? "The house keeps all the entry money" : "Every entry is refunded" },
                  ]
                : [
                    { label: "Platform fee", value: c.entryFee === 0 ? "—" : feeNote },
                    { label: "Prize split", value: describeSplit(c.prizeSplit) },
                    { label: "Prize pool at the minimum", value: c.entryFee === 0 && sponsor === 0 ? "No cash prize" : naira(atMin.prizePool) },
                    { label: "Prize pool when full", value: c.entryFee === 0 && sponsor === 0 ? "No cash prize" : naira(atMax.prizePool) },
                  ]),
              ...(sponsor > 0 ? [{ label: "Sponsor", value: `${naira(sponsor)} · ${c.sponsorship?.source}` }] : []),
            ]}
          />
        </Panel>
      </Section>

      {categoryMode && (
        <Section title="Prize categories">
          <Panel>
            <ul className="flex flex-col divide-y divide-border text-[13px]">
              {c.prizeCategories.map((p) => (
                <li key={p.id} className="flex items-start justify-between gap-4 py-2 first:pt-0 last:pb-0">
                  <div className="flex min-w-0 flex-col">
                    <span className="font-medium text-foreground">{p.name}</span>
                    <span className="text-[12px] text-muted">
                      {p.comboOfCategoryIds.length > 0
                        ? `Combined: wins ${p.comboOfCategoryIds.map((k) => catName.get(k) ?? "?").join(" + ")}`
                        : `Place ${p.place} by ${p.metricRequirementId ? (reqName.get(p.metricRequirementId) ?? "?") : c.metricLabel}${p.requiresRequirementIds.length > 0 ? ` · needs: ${p.requiresRequirementIds.map((k) => reqName.get(k) ?? "?").join(", ")}` : ""}`}
                    </span>
                  </div>
                  <span className="shrink-0 font-semibold tabular-nums">{naira(p.amountKobo)}</span>
                </li>
              ))}
            </ul>
          </Panel>
        </Section>
      )}

      <Section title="Timeline">
        <Panel>
          <KeyValue
            items={[
              { label: "Entries open", value: formatDate(c.entryOpensAt) },
              { label: "Entries close", value: formatDate(c.entryClosesAt) },
              { label: "Match window", value: `${formatDate(c.windowStartsAt)} → ${formatDate(c.windowEndsAt)}` },
              { label: "Submissions close", value: formatDate(c.submissionsCloseAt) },
              { label: "Dispute window", value: `${c.disputeWindowMinutes} minutes after provisional results` },
              { label: "Server time", value: formatDate(now) },
            ]}
          />
        </Panel>
      </Section>

      {(c.status === "LIVE" || c.status === "SUBMISSIONS_CLOSED" || c.status === "UNDER_REVIEW" || c.status === "PROVISIONAL") && (
        <Section title="Review">
          <Panel>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-[13px] text-foreground">
                {pending === 0 ? "No submissions are waiting for review." : `${pending} submission${pending === 1 ? " is" : "s are"} waiting for review.`}
              </p>
              <Link href={`/admin/challenges/daily/${c.id}/review`} className="btn-primary text-sm">
                Open review queue
              </Link>
            </div>
          </Panel>
        </Section>
      )}

      {showSettlement && (
        <Section title="Settlement">
          <Panel>
            <div className="flex flex-col gap-4">
              {c.status === "COMPLETED" ? (
                <KeyValue
                  items={[
                    { label: "Entry money held", value: naira(c.collectedKobo ?? 0) },
                    { label: "Prizes awarded", value: naira(c.awardedKobo ?? 0) },
                    { label: "Kept by the house", value: naira(c.houseKobo ?? 0) },
                    { label: "Settled", value: formatDate(c.settledAt) },
                    { label: "Result", value: c.settlementNote ?? "—" },
                  ]}
                />
              ) : preview?.plan.ok ? (
                <>
                  <p className="text-[13px] text-foreground">
                    {c.status === "PROVISIONAL" ? "If it were settled now: " : ""}
                    {preview.description}
                  </p>
                  {planAwards.length > 0 && (
                    <ul className="flex flex-col divide-y divide-border text-[13px]">
                      {planAwards.map((a) => (
                        <li key={`${a.categoryKey}-${a.userId}`} className="flex items-center justify-between gap-4 py-1.5 first:pt-0 last:pb-0">
                          <span>
                            {preview.names.get(a.categoryKey) ?? `Place ${a.categoryKey.replace("place-", "")}`} · <span className="text-muted">{userName.get(a.userId) ?? a.userId}</span>
                          </span>
                          <span className="font-semibold tabular-nums">{naira(a.amount)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {needsApproval && (
                    <p className="text-[12px] text-muted">
                      {c.payoutApprovedAt ? `Payout approved by ${approvedBy?.displayName ?? "staff"} on ${formatDate(c.payoutApprovedAt)}.` : "This payout needs a named approval first: a sponsor's money is involved, or the prizes are over the auto-approval limit."}
                    </p>
                  )}
                  {c.settlementNote && <p className="text-[12px] text-gold">{c.settlementNote}</p>}
                  {(c.status === "FINALIZED" || c.status === "SETTLING") && (
                    <SettlementActions challengeId={c.id} canApprove={c.status === "FINALIZED" && needsApproval && !c.payoutApprovedAt} canSettle={!needsApproval || !!c.payoutApprovedAt} />
                  )}
                  {c.status === "PROVISIONAL" && <p className="text-[12px] text-muted">Nothing is paid until the dispute window has passed with nothing open and the standings are final.</p>}
                </>
              ) : (
                <p className="text-[13px] text-danger">{preview && !preview.plan.ok ? preview.plan.error : "Settlement can't be previewed."}</p>
              )}
              {paid.length > 0 && (
                <ul className="flex flex-col divide-y divide-border text-[13px]">
                  {paid.map((a) => (
                    <li key={a.id} className="flex items-center justify-between gap-4 py-1.5 first:pt-0 last:pb-0">
                      <span>
                        {a.categoryName} · <span className="text-muted">{a.user.displayName} (@{a.user.handle})</span>
                      </span>
                      <span className="font-semibold tabular-nums">{naira(a.amountKobo)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Panel>
        </Section>
      )}

      <Section title="What players see">
        <Panel>
          <div className="flex flex-col gap-4 text-[13px]">
            <div>
              <p className="text-[12px] text-muted">Rules</p>
              <p className="whitespace-pre-wrap text-foreground">{c.rules}</p>
            </div>
            <div>
              <p className="text-[12px] text-muted">Scoring</p>
              <p className="text-foreground">
                {c.metricLabel}
                {c.metricUnit ? ` (${c.metricUnit})` : ""} — {c.direction === "HIGHER" ? "highest" : "lowest"} score wins.
                {c.tiebreakLabel ? ` Ties go to the ${c.tiebreakDirection === "HIGHER" ? "highest" : "lowest"} ${c.tiebreakLabel}.` : ""} {c.tiebreakRule}
              </p>
            </div>
            <div>
              <p className="text-[12px] text-muted">To qualify, every one of these has to be met</p>
              {c.requirements.length === 0 ? (
                <p className="text-foreground">No extra requirements.</p>
              ) : (
                <ul className="list-inside list-disc text-foreground">
                  {c.requirements.map((r) => (
                    <li key={r.id}>{describeRequirement(r)}</li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <p className="text-[12px] text-muted">Evidence</p>
              <p className="text-foreground">
                {c.evidenceRequirements}
                {c.requireRecording ? " A screen recording is also required." : ""}
              </p>
            </div>
          </div>
        </Panel>
      </Section>
    </>
  );
}
