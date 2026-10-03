/**
 * Circuit — Admin Disputes: every match dispute and lobby result flag,
 * oldest first. "Escalated" is the staff queue (staff rule on the match
 * page — /admin/matches/[id] — or, for lobby flags, on the tournament's
 * standings). "With organizers" shows disputes still inside the
 * organizer's ruling window, so staff can see what's coming.
 */

import Link from "next/link";
import type { DisputeStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { EmptyState, PageHeader, StatusBadge, SubNav } from "@/components/admin/ui";
import { RowLink } from "@/components/admin/ui-client";

function waiting(date: Date): string {
  const hours = Math.floor((Date.now() - date.getTime()) / 3_600_000);
  if (hours < 1) return "under an hour";
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

const TABS = ["escalated", "organizer", "flags"] as const;

export default async function AdminDisputesPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab: tabParam } = await searchParams;
  const tab = TABS.find((t) => t === tabParam) ?? "escalated";
  const statusFor: Record<"escalated" | "organizer", DisputeStatus[]> = { escalated: ["ESCALATED"], organizer: ["OPEN", "ORGANIZER_REVIEW"] };

  const [escalatedCount, organizerCount, flagCount, disputes, flags] = await Promise.all([
    prisma.dispute.count({ where: { status: "ESCALATED" } }),
    prisma.dispute.count({ where: { status: { in: ["OPEN", "ORGANIZER_REVIEW"] } } }),
    prisma.lobbyFlag.count({ where: { status: "ESCALATED" } }),
    tab === "flags"
      ? Promise.resolve([])
      : prisma.dispute.findMany({
          where: { status: { in: statusFor[tab] } },
          orderBy: { createdAt: "asc" },
          take: 100,
          include: {
            match: {
              include: {
                playerA: { select: { displayName: true } },
                playerB: { select: { displayName: true } },
                tournament: { select: { name: true } },
                battle: { select: { game: true, stakeAmount: true } },
              },
            },
          },
        }),
    tab === "flags"
      ? prisma.lobbyFlag.findMany({
          where: { status: "ESCALATED" },
          orderBy: { escalatedAt: "asc" },
          include: { user: { select: { displayName: true } }, round: { select: { number: true, stage: true, group: true, stageRound: true, tournament: { select: { id: true, name: true } } } } },
        })
      : Promise.resolve([]),
  ]);

  return (
    <>
      <PageHeader title="Disputes" description="Match results the players couldn't agree on, and lobby results a player flagged. Oldest first." />
      <SubNav
        active={tab}
        items={[
          { key: "escalated", label: "Escalated to staff", href: "/admin/disputes", count: escalatedCount },
          { key: "organizer", label: "With organizers", href: "/admin/disputes?tab=organizer", count: organizerCount },
          { key: "flags", label: "Lobby result flags", href: "/admin/disputes?tab=flags", count: flagCount },
        ]}
      />

      {tab !== "flags" ? (
        disputes.length === 0 ? (
          <EmptyState
            title={tab === "escalated" ? "No escalated disputes" : "No disputes with organizers"}
            description={tab === "escalated" ? "Disputes land here when an organizer misses their ruling window, or when there's no organizer (challenges)." : undefined}
          />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Match</th>
                  <th>From</th>
                  <th>Status</th>
                  <th className="text-right">{tab === "organizer" ? "Organizer deadline" : "Waiting"}</th>
                </tr>
              </thead>
              <tbody>
                {disputes.map((d) => (
                  <RowLink key={d.id} href={`/admin/matches/${d.matchId}`}>
                    <td>
                      <Link href={`/admin/matches/${d.matchId}`} className="font-medium text-foreground">
                        {d.match.playerA.displayName} <span className="text-muted">vs</span> {d.match.playerB.displayName}
                      </Link>
                    </td>
                    <td className="text-muted">
                      {d.match.tournament ? `${d.match.tournament.name} · Round ${d.match.round}` : `${d.match.battle?.game} challenge${d.match.battle?.stakeAmount ? " · staked" : ""}`}
                    </td>
                    <td>
                      <StatusBadge tone={d.status === "ESCALATED" ? "danger" : "attention"}>{d.status === "ESCALATED" ? "Needs staff ruling" : "Organizer reviewing"}</StatusBadge>
                    </td>
                    <td className="text-right text-muted">
                      {tab === "organizer" && d.organizerRulingDeadline
                        ? d.organizerRulingDeadline.toLocaleString("en-NG", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })
                        : waiting(d.createdAt)}
                    </td>
                  </RowLink>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : flags.length === 0 ? (
        <EmptyState title="No escalated lobby flags" description="A player can take a lobby result flag to staff if the organizer dismisses it or doesn't answer within 24 hours." />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Tournament</th>
                <th>Flag</th>
                <th className="text-right">Waiting</th>
              </tr>
            </thead>
            <tbody>
              {flags.map((f) => {
                const href = `/tournaments/${f.round.tournament.id}/bracket?tab=rounds`;
                const round =
                  f.round.stage === "GROUP"
                    ? `Group ${String.fromCharCode(64 + f.round.group)} · Round ${f.round.stageRound}`
                    : f.round.stage === "FINAL"
                      ? `Final · Round ${f.round.stageRound}`
                      : `Round ${f.round.stageRound || f.round.number}`;
                return (
                  <RowLink key={f.id} href={href}>
                    <td>
                      <Link href={href} className="flex flex-col leading-tight">
                        <span className="font-medium text-foreground">{f.round.tournament.name}</span>
                        <span className="text-[12px] text-muted">{round}</span>
                      </Link>
                    </td>
                    <td className="max-w-[420px] text-muted">
                      <span className="text-foreground">{f.user.displayName}:</span> <span className="line-clamp-2">{f.reason}</span>
                    </td>
                    <td className="text-right text-muted">{waiting(f.escalatedAt ?? f.createdAt)}</td>
                  </RowLink>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
