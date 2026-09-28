/**
 * Circuit — admin match/dispute review, native to the admin shell.
 * Replaces the "View match ↗"/"Rule now ↗" links out to the player-facing
 * `/matches/[id]` — same real data (players, submitted results, proof,
 * dispute status, activity timeline) and the exact same `RulingForm` that
 * page renders, just hosted here with an admin-appropriate back link and
 * player links pointing at the admin user page instead of the public
 * profile.
 *
 * A staff account viewing this is always eligible for the *staff* ruling
 * path only (never the organizer path — that stays on the player-facing
 * page, since it's the organizer's own call, not staff's). Staff can only
 * actually rule once a dispute is ESCALATED, same restriction the ruling
 * API itself enforces (`ruleDispute`'s `NOT_ESCALATED` check) — an
 * OPEN/ORGANIZER_REVIEW dispute shows its real status here, not a form
 * staff can't submit.
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowUpRight, Scale, Trophy } from "lucide-react";
import { prisma } from "@/lib/db";
import { matchStatusInfo } from "@/components/StatusPill";
import { PageHeader, Panel, Section, StatusBadge, toneFor } from "@/components/admin/ui";
import { ActivityTimeline } from "@/components/ActivityTimeline";
import { buildMatchTimeline } from "@/lib/matchTimeline";
import RulingForm from "@/app/matches/[id]/RulingForm";

export default async function AdminMatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const match = await prisma.match.findUnique({
    where: { id },
    include: {
      playerA: true,
      playerB: true,
      winner: true,
      tournament: { select: { id: true, name: true } },
      battle: { select: { id: true, game: true } },
      dispute: true,
    },
  });
  if (!match) notFound();

  const canRuleAsStaff = match.dispute?.status === "ESCALATED";
  const voidUnsupportedReason = match.tournamentId
    ? "Voiding a tournament bracket match isn't supported yet."
    : undefined;
  const status = matchStatusInfo(match.status);

  const backHref = match.tournamentId ? `/admin/competitions/${match.tournamentId}` : `/admin/challenges/${match.battleId}`;
  const backLabel = match.tournamentId ? (match.tournament?.name ?? "Competition") : "Challenge";
  type Report = { winnerId: string; score: string; submittedAt?: string; kills?: number };
  const sides = [
    { key: "a", label: "Player A", player: match.playerA, report: match.resultA as unknown as Report | null, proof: match.proofARef },
    { key: "b", label: "Player B", player: match.playerB, report: match.resultB as unknown as Report | null, proof: match.proofBRef },
  ];
  const nameOf = (userId: string) => (userId === match.playerA.id ? match.playerA.displayName : userId === match.playerB.id ? match.playerB.displayName : "Unknown");
  const reportsDisagree = !!(sides[0].report && sides[1].report && (sides[0].report.winnerId !== sides[1].report.winnerId || sides[0].report.score !== sides[1].report.score));

  return (
    <>
      <PageHeader
        back={{ href: backHref, label: backLabel }}
        title={`${match.playerA.displayName} vs ${match.playerB.displayName}`}
        meta={
          <>
            <StatusBadge tone={toneFor(status.tone)} dot={status.pulse}>
              {status.label}
            </StatusBadge>
            <span>{match.tournament ? `${match.tournament.name} · Round ${match.round}` : `${match.battle?.game} challenge`}</span>
            <span>
              · Code <span className="font-code text-foreground">{match.matchCode}</span>
            </span>
          </>
        }
      />

      {match.status === "DISPUTED" && match.dispute && (
        <div
          className={`flex items-start gap-3 rounded-[10px] border px-4 py-3 text-[13px] ${
            canRuleAsStaff ? "border-danger/30 bg-danger/[0.06]" : "border-border bg-surface"
          }`}
        >
          <Scale size={16} className={`mt-0.5 shrink-0 ${canRuleAsStaff ? "text-danger" : "text-muted"}`} />
          <span className="text-foreground">
            {canRuleAsStaff
              ? "Escalated to staff — compare both reports below, then rule. Your ruling is final."
              : match.dispute.status === "ORGANIZER_REVIEW"
                ? "Waiting on the tournament organizer's ruling. It escalates to staff automatically if they miss the window."
                : "This dispute isn't in the staff queue."}
          </span>
        </div>
      )}

      <Section title="Reported results" description={reportsDisagree ? "The two reports disagree." : undefined}>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {sides.map((side) => {
            const isWinner = match.winnerId === side.player.id;
            return (
              <Panel key={side.key} className={isWinner ? "!border-success/40" : ""}>
                <div className="flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-3">
                    <Link href={`/admin/users/${side.player.id}`} className="flex min-w-0 flex-col leading-tight">
                      <span className="text-[11px] font-medium text-muted-strong">{side.label}</span>
                      <span className="flex items-center gap-1.5 truncate text-[14px] font-semibold text-foreground">
                        {isWinner && <Trophy size={13} className="shrink-0 text-gold" aria-label="Winner" />}
                        {side.player.displayName}
                      </span>
                      <span className="text-[12px] text-muted">@{side.player.handle}</span>
                    </Link>
                    {side.proof ? (
                      <a href={`/api/matches/${match.id}/proof/${side.key}`} target="_blank" rel="noreferrer" className="btn-secondary !min-h-8 !px-2.5 !text-[12px]">
                        View proof <ArrowUpRight size={13} />
                      </a>
                    ) : (
                      <span className="text-[12px] text-muted-strong">No proof</span>
                    )}
                  </div>
                  {side.report ? (
                    <dl className="grid grid-cols-3 gap-3 border-t border-border pt-3 text-[13px]">
                      <div className="flex flex-col gap-0.5">
                        <dt className="text-[12px] text-muted">Says winner</dt>
                        <dd className="truncate font-medium text-foreground">{nameOf(side.report.winnerId)}</dd>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <dt className="text-[12px] text-muted">Score</dt>
                        <dd className="font-medium text-foreground">{side.report.score || "—"}</dd>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <dt className="text-[12px] text-muted">{side.report.kills !== undefined ? "Kills" : "Submitted"}</dt>
                        <dd className="text-foreground">
                          {side.report.kills !== undefined
                            ? side.report.kills
                            : side.report.submittedAt
                              ? new Date(side.report.submittedAt).toLocaleString("en-NG", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })
                              : "—"}
                        </dd>
                      </div>
                    </dl>
                  ) : (
                    <p className="border-t border-border pt-3 text-[13px] text-muted">Hasn&apos;t reported a result.</p>
                  )}
                </div>
              </Panel>
            );
          })}
        </div>
      </Section>

      {match.status === "DISPUTED" && match.dispute && canRuleAsStaff && (
        <Section title="Staff ruling">
          <Panel>
            <RulingForm
              disputeId={match.dispute.id}
              endpoint={`/api/staff/disputes/${match.dispute.id}/rule`}
              playerA={match.playerA}
              playerB={match.playerB}
              voidUnsupportedReason={voidUnsupportedReason}
            />
          </Panel>
        </Section>
      )}

      <Section title="Activity">
        <Panel>
          <ActivityTimeline events={buildMatchTimeline(match)} />
        </Panel>
      </Section>
    </>
  );
}
