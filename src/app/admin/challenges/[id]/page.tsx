/**
 * Circuit — admin challenge detail, native to the admin shell. Real
 * `Battle` data plus its linked `Match` (if accepted) — same real
 * relations `/admin/challenges`'s list page reads, just at the per-item
 * level. "View match" is native too, at `/admin/matches/[id]` — the same
 * `RulingForm` the player-facing match page uses, just hosted here.
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { ChevronRight } from "lucide-react";
import { battleStatusInfo, matchStatusInfo, disputeStatusInfo } from "@/components/StatusPill";
import { EmptyState, KeyValue, naira, PageHeader, Panel, Section, StatusBadge, toneFor } from "@/components/admin/ui";
import { CancelChallengeButton } from "@/components/admin/CancelChallengeButton";

function formatDate(date: Date): string {
  return date.toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" });
}

function formatBattleFormat(format: string): string {
  return format === "BEST_OF_3" ? "Best of 3" : "Single match";
}

export default async function AdminChallengeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const battle = await prisma.battle.findUnique({
    where: { id },
    include: {
      creator: { select: { id: true, displayName: true, handle: true } },
      targetUser: { select: { id: true, displayName: true, handle: true } },
      matches: {
        include: {
          playerA: { select: { id: true, displayName: true, handle: true } },
          playerB: { select: { id: true, displayName: true, handle: true } },
          winner: { select: { displayName: true } },
          dispute: true,
        },
      },
    },
  });
  if (!battle) notFound();

  const status = battleStatusInfo(battle.status);
  const match = battle.matches[0] ?? null;

  return (
    <>
      <PageHeader
        back={{ href: "/admin/challenges", label: "Challenges" }}
        title={`${battle.game} challenge`}
        meta={
          <>
            <StatusBadge tone={toneFor(status.tone)} dot={status.pulse}>
              {status.label}
            </StatusBadge>
            <span>
              {formatBattleFormat(battle.format)} · {battle.visibility === "TARGETED" ? "Targeted" : "Open to anyone"}
            </span>
          </>
        }
        actions={battle.status === "OPEN" && <CancelChallengeButton battleId={battle.id} />}
      />

      <Panel>
        <KeyValue
          items={[
            {
              label: "Host",
              value: (
                <Link href={`/admin/users/${battle.creator.id}`} className="hover:underline">
                  {battle.creator.displayName} <span className="text-muted">@{battle.creator.handle}</span>
                </Link>
              ),
            },
            { label: "Stake", value: battle.stakeAmount === 0 ? "Free" : `${naira(battle.stakeAmount)} each · ${naira(battle.stakeAmount * 2)} pot` },
            { label: "Created", value: formatDate(battle.createdAt) },
            ...(battle.visibility === "TARGETED" && battle.targetUser
              ? [
                  {
                    label: "Sent to",
                    value: (
                      <Link href={`/admin/users/${battle.targetUser.id}`} className="hover:underline">
                        {battle.targetUser.displayName} <span className="text-muted">@{battle.targetUser.handle}</span>
                      </Link>
                    ),
                  },
                ]
              : []),
          ]}
        />
      </Panel>

      <Section title="Match">
        {!match ? (
          <EmptyState title="Not accepted yet" description="The match appears here once someone accepts the challenge." />
        ) : (
          <Panel padded={false}>
            <Link
              href={`/admin/matches/${match.id}`}
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5 transition-colors hover:bg-surface-elevated sm:px-5"
            >
              <span className="flex flex-col gap-0.5">
                <span className="text-[13px] font-medium text-foreground">
                  {match.playerA.displayName} <span className="text-muted">vs</span> {match.playerB.displayName}
                </span>
                <span className="text-[12px] text-muted">
                  Code <span className="font-code">{match.matchCode}</span>
                  {match.winner && <> · Winner {match.winner.displayName}</>}
                </span>
              </span>
              <span className="flex items-center gap-2">
                {match.dispute && (
                  <StatusBadge tone={toneFor(disputeStatusInfo(match.dispute.status).tone)}>Dispute · {disputeStatusInfo(match.dispute.status).label}</StatusBadge>
                )}
                <StatusBadge tone={toneFor(matchStatusInfo(match.status).tone)} dot={matchStatusInfo(match.status).pulse}>
                  {matchStatusInfo(match.status).label}
                </StatusBadge>
                <ChevronRight size={15} className="text-muted-strong" />
              </span>
            </Link>
          </Panel>
        )}
      </Section>
    </>
  );
}
