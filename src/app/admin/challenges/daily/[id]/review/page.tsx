/**
 * Circuit — Admin: the review queue for one Daily Challenge. Each submission shows the evidence next to what the
 * player claimed, with the checks a reviewer needs to make a call: whether it was uploaded inside the window, and
 * whether the same file has been used anywhere else. The decision is made by hand, requirement by requirement.
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { describeRequirement, REVIEW_REASON_LABEL, isReviewReasonCode } from "@/lib/dailyChallenges";
import { EmptyState, PageHeader, Panel, StatusBadge, SubNav } from "@/components/admin/ui";
import { SubmissionReviewForm, type ReviewRequirement } from "@/components/admin/SubmissionReviewForm";
import { EVIDENCE_FLAG_TEXT, type EvidenceFlag } from "@/lib/evidenceCheck";
import { DisputeRulingForm } from "@/components/admin/DisputeRulingForm";

function formatDate(date: Date): string {
  return date.toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "medium" });
}

export default async function DailyChallengeReviewPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { id } = await params;
  const { tab: tabParam } = await searchParams;
  const tab = tabParam === "reviewed" ? "reviewed" : tabParam === "disputes" ? "disputes" : "pending";

  const c = await prisma.dailyChallenge.findUnique({ where: { id }, include: { requirements: { orderBy: { sortOrder: "asc" } } } });
  if (!c) notFound();

  const disputes = await prisma.dailyChallengeDispute.findMany({
    where: { submission: { entry: { challengeId: id } } },
    orderBy: [{ status: "asc" }, { createdAt: "asc" }],
    include: {
      raisedBy: { select: { displayName: true, handle: true } },
      ruledBy: { select: { displayName: true } },
      submission: { include: { entry: { include: { user: { select: { displayName: true, handle: true } } } }, reviews: { orderBy: { createdAt: "desc" }, take: 1, include: { reviewer: { select: { displayName: true } } } } } },
    },
  });
  const openDisputes = disputes.filter((d) => d.status === "OPEN").length;

  const [pendingCount, reviewedCount, submissions] = await Promise.all([
    prisma.dailyChallengeSubmission.count({ where: { status: "PENDING", entry: { challengeId: id } } }),
    prisma.dailyChallengeSubmission.count({ where: { status: { not: "PENDING" }, entry: { challengeId: id } } }),
    prisma.dailyChallengeSubmission.findMany({
      where: { entry: { challengeId: id }, status: tab === "pending" ? "PENDING" : { not: "PENDING" } },
      ...(tab === "disputes" ? { take: 0 } : {}),
      orderBy: tab === "pending" ? { submittedAt: "asc" } : { reviewedAt: "desc" },
      take: 50,
      include: {
        entry: { include: { user: { select: { id: true, displayName: true, handle: true } } } },
        requirementResults: true,
        reviews: { orderBy: { createdAt: "desc" }, take: 1, include: { reviewer: { select: { displayName: true } } } },
      },
    }),
  ]);

  // The same file anywhere else — another player, another challenge — is the cheapest cheat to catch.
  const hashes = submissions.map((s) => s.evidenceHash);
  const sameFile = hashes.length
    ? await prisma.dailyChallengeSubmission.findMany({
        where: { evidenceHash: { in: hashes } },
        select: { id: true, evidenceHash: true, entry: { select: { challengeId: true, user: { select: { handle: true } } } } },
      })
    : [];

  return (
    <>
      <PageHeader
        title="Review queue"
        back={{ href: `/admin/challenges/daily/${id}`, label: c.title }}
        description="Check each submission against its evidence by hand. Only approved scores rank. A rejection or disqualification keeps the entry fee."
      />
      <SubNav
        active={tab}
        items={[
          { key: "pending", label: "Waiting", href: `/admin/challenges/daily/${id}/review`, count: pendingCount },
          { key: "reviewed", label: "Reviewed", href: `/admin/challenges/daily/${id}/review?tab=reviewed`, count: reviewedCount },
          { key: "disputes", label: "Disputes", href: `/admin/challenges/daily/${id}/review?tab=disputes`, count: openDisputes },
        ]}
      />

      {tab === "disputes" ? (
        disputes.length === 0 ? (
          <EmptyState title="No disputes" description="A player can dispute a decision while the results are provisional." />
        ) : (
          <div className="flex flex-col gap-4">
            {disputes.map((d) => {
              const last = d.submission.reviews[0];
              return (
                <Panel key={d.id}>
                  <div className="flex flex-col gap-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[14px] font-semibold text-foreground">
                          {d.submission.entry.user.displayName} <span className="text-[12px] font-normal text-muted">@{d.submission.entry.user.handle}</span>
                        </span>
                        <span className="text-[12px] text-muted">
                          Claimed {d.submission.score} · decision: {last ? `${last.decision.toLowerCase()} by ${last.reviewer.displayName}${isReviewReasonCode(last.reasonCode) ? ` (${REVIEW_REASON_LABEL[last.reasonCode]})` : ""}` : "—"}
                        </span>
                      </div>
                      <StatusBadge tone={d.status === "OPEN" ? "attention" : d.status === "UPHELD" ? "success" : "neutral"}>{d.status === "OPEN" ? "Open" : d.status === "UPHELD" ? "Upheld" : "Dismissed"}</StatusBadge>
                    </div>
                    <p className="border-l-2 border-border-strong pl-3 text-[13px] text-foreground">{d.reason}</p>
                    <a href={`/api/daily-challenges/submissions/${d.submission.id}/evidence`} target="_blank" rel="noreferrer" className="text-[12px] underline">
                      Open the evidence
                    </a>
                    {d.status === "OPEN" ? (
                      <DisputeRulingForm disputeId={d.id} />
                    ) : (
                      <p className="border-t border-border pt-3 text-[12px] text-muted">
                        {d.ruledBy?.displayName ?? "Staff"} · {d.ruling}
                      </p>
                    )}
                  </div>
                </Panel>
              );
            })}
          </div>
        )
      ) : submissions.length === 0 ? (
        <EmptyState title={tab === "pending" ? "Nothing waiting" : "Nothing reviewed yet"} description={tab === "pending" ? "Submissions show up here as players upload them." : undefined} />
      ) : (
        <div className="flex flex-col gap-4">
          {submissions.map((s) => {
            const dupes = sameFile.filter((o) => o.evidenceHash === s.evidenceHash && o.id !== s.id);
            const inWindow = s.submittedAt >= c.windowStartsAt && s.submittedAt <= c.submissionsCloseAt;
            const results = new Map(s.requirementResults.map((r) => [r.requirementId, r]));
            const reqs: ReviewRequirement[] = c.requirements.map((r) => ({
              id: r.id,
              kind: r.kind,
              label: r.label,
              unit: r.unit,
              direction: r.direction,
              threshold: r.threshold,
              claimedMet: results.get(r.id)?.claimedMet ?? null,
              claimedValue: results.get(r.id)?.claimedValue ?? null,
            }));
            const last = s.reviews[0];
            return (
              <Panel key={s.id}>
                <div className="flex flex-col gap-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex flex-col gap-0.5">
                      <span className="flex flex-wrap items-center gap-2">
                        <Link href={`/admin/users/${s.entry.user.id}`} className="text-[14px] font-semibold text-foreground hover:underline">
                          {s.entry.user.displayName}
                        </Link>
                        <span className="text-[12px] text-muted">@{s.entry.user.handle}</span>
                      </span>
                      <span className="text-[12px] text-muted">
                        In-game name at entry: <strong className="text-foreground">{s.entry.inGameName}</strong> · submitted {formatDate(s.submittedAt)}
                        {s.entry.verificationCode && s.recordingRef ? <> · entry code to look for in the recording: <strong className="font-mono text-foreground">{s.entry.verificationCode}</strong></> : null}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <StatusBadge tone={inWindow ? "neutral" : "danger"}>{inWindow ? "Uploaded in the window" : "Uploaded outside the window"}</StatusBadge>
                      {dupes.length > 0 && <StatusBadge tone="danger">Same file used {dupes.length} other time{dupes.length === 1 ? "" : "s"}</StatusBadge>}
                      {s.status === "VERIFIED" && <StatusBadge tone="success">Verified {s.verifiedScore}</StatusBadge>}
                      {s.status === "REJECTED" && <StatusBadge tone="danger">Rejected</StatusBadge>}
                    </div>
                  </div>

                  {s.evidenceFlags.length > 0 && (
                    <ul className="flex flex-col gap-1 rounded-[8px] border border-border bg-surface-elevated px-3 py-2 text-[12px] text-foreground">
                      {s.evidenceFlags.map((f) => {
                        const info = EVIDENCE_FLAG_TEXT[f as EvidenceFlag];
                        return info ? (
                          <li key={f} className={info.tone === "warn" ? "text-warning" : "text-muted"}>
                            {info.text}
                          </li>
                        ) : null;
                      })}
                      {s.evidenceCapturedAt && <li className="text-muted">File says it was taken {formatDate(s.evidenceCapturedAt)}. A hint to weigh, not a verdict.</li>}
                    </ul>
                  )}

                  {dupes.length > 0 && (
                    <p className="rounded-[8px] border border-danger/40 bg-danger/10 px-3 py-2 text-[12px] text-foreground">
                      This exact file was also uploaded by {dupes.map((d) => `@${d.entry.user.handle}${d.entry.challengeId === id ? "" : " (another challenge)"}`).join(", ")}. A re-used scoreboard is a strong reason to reject.
                    </p>
                  )}

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_320px]">
                    <a href={`/api/daily-challenges/submissions/${s.id}/evidence`} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-[8px] border border-border bg-black">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={`/api/daily-challenges/submissions/${s.id}/evidence`} alt={`Scoreboard from ${s.entry.user.handle}`} className="max-h-[420px] w-full object-contain" />
                    </a>
                    <dl className="flex flex-col gap-2 text-[13px]">
                      <div>
                        <dt className="text-[12px] text-muted">Claimed {c.metricLabel.toLowerCase()}</dt>
                        <dd className="text-[20px] font-semibold tabular-nums">{s.score}</dd>
                      </div>
                      {c.tiebreakLabel && (
                        <div>
                          <dt className="text-[12px] text-muted">Claimed {c.tiebreakLabel.toLowerCase()}</dt>
                          <dd className="tabular-nums">{s.tiebreakScore ?? "—"}</dd>
                        </div>
                      )}
                      {s.recordingRef && (
                        <div>
                          <dt className="text-[12px] text-muted">Screen recording</dt>
                          <dd>
                            <a href={`/api/daily-challenges/submissions/${s.id}/evidence?file=recording`} target="_blank" rel="noreferrer" className="underline">
                              Open recording
                            </a>
                          </dd>
                        </div>
                      )}
                      {c.requirements.length > 0 && (
                        <div>
                          <dt className="text-[12px] text-muted">Requirements</dt>
                          <dd className="flex flex-col gap-0.5">
                            {c.requirements.map((r) => (
                              <span key={r.id}>{describeRequirement(r)}</span>
                            ))}
                          </dd>
                        </div>
                      )}
                    </dl>
                  </div>

                  {s.status === "PENDING" ? (
                    <SubmissionReviewForm
                      submissionId={s.id}
                      claimedScore={s.score}
                      claimedTiebreak={s.tiebreakScore}
                      metricLabel={c.metricLabel}
                      tiebreakLabel={c.tiebreakLabel}
                      requirements={reqs}
                    />
                  ) : (
                    last && (
                      <p className="border-t border-border pt-3 text-[12px] text-muted">
                        {last.reviewer.displayName} · {last.decision.toLowerCase()}
                        {last.scoreAfter !== null && last.scoreAfter !== last.scoreBefore ? ` · corrected ${last.scoreBefore} → ${last.scoreAfter}` : ""}
                        {isReviewReasonCode(last.reasonCode) ? ` · ${REVIEW_REASON_LABEL[last.reasonCode]}` : ""}
                        {last.note ? ` · ${last.note}` : ""}
                      </p>
                    )
                  )}
                </div>
              </Panel>
            );
          })}
        </div>
      )}
    </>
  );
}
