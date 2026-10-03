/**
 * Circuit — the Activity feed: what's been happening on the platform,
 * built only from real rows (no stored feed, no invented posts). Newest
 * first, merged from: platform announcements, new tournaments, finished
 * tournaments, decided matches, and newly created communities. Everything
 * here is already public on its own page; the feed just gathers it.
 */

import { prisma } from "@/lib/db";
import { communityHref } from "@/lib/community";
import { tournamentPath } from "@/lib/seo";
import { DRAW_RESULT } from "@/lib/leagueTable";

export type ActivityKind = "announcement" | "tournament" | "finished" | "result" | "community";

export type ActivityItem = {
  id: string;
  at: Date;
  kind: ActivityKind;
  title: string;
  detail: string | null;
  href: string | null;
};

const naira = (kobo: number) => `₦${(kobo / 100).toLocaleString("en-NG")}`;

type Result = { winnerId: string; score: string };

export async function getActivity({ take = 30, days = 30 }: { take?: number; days?: number } = {}): Promise<ActivityItem[]> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const [announcements, newTournaments, finished, matches, communities] = await Promise.all([
    prisma.announcement.findMany({ where: { enabled: true, createdAt: { gte: since } }, orderBy: { createdAt: "desc" }, take: 5 }),
    prisma.tournament.findMany({
      where: { createdAt: { gte: since }, status: { in: ["OPEN", "LIVE", "COMPLETE"] } },
      orderBy: { createdAt: "desc" },
      take: take,
      select: { id: true, name: true, game: true, createdAt: true, prizeAmount: true, entryFee: true, teamSize: true },
    }),
    prisma.tournament.findMany({
      where: { status: "COMPLETE", completedAt: { gte: since } },
      orderBy: { completedAt: "desc" },
      take: take,
      select: { id: true, name: true, game: true, completedAt: true, prizeAmount: true },
    }),
    prisma.match.findMany({
      where: { status: "COMPLETE", winnerId: { not: null }, updatedAt: { gte: since } },
      orderBy: { updatedAt: "desc" },
      take: take,
      select: {
        id: true,
        updatedAt: true,
        winnerId: true,
        resultA: true,
        resultB: true,
        playerA: { select: { id: true, displayName: true } },
        playerB: { select: { id: true, displayName: true } },
        tournament: { select: { name: true } },
        battle: { select: { game: true } },
      },
    }),
    prisma.community.findMany({
      where: { createdAt: { gte: since }, enabled: true, suspendedAt: null, kind: "PLAYER", joinPolicy: { not: "INVITE" }, slug: { not: null }, name: { not: null } },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, name: true, kind: true, slug: true, tournamentId: true, createdAt: true },
    }),
  ]);

  const items: ActivityItem[] = [
    ...announcements.map((a): ActivityItem => ({ id: `a-${a.id}`, at: a.createdAt, kind: "announcement", title: a.title, detail: a.body, href: null })),
    ...newTournaments.map(
      (t): ActivityItem => ({
        id: `t-${t.id}`,
        at: t.createdAt,
        kind: "tournament",
        title: `New tournament: ${t.name}`,
        detail: `${t.game} · ${t.teamSize} · ${t.prizeAmount ? `${naira(t.prizeAmount)} prize pool` : t.entryFee === 0 ? "Free entry" : `${naira(t.entryFee)} entry`}`,
        href: tournamentPath(t),
      }),
    ),
    ...finished.map(
      (t): ActivityItem => ({
        id: `f-${t.id}`,
        at: t.completedAt!,
        kind: "finished",
        title: `${t.name} has finished`,
        detail: t.prizeAmount ? `${t.game} · ${naira(t.prizeAmount)} prize pool` : t.game,
        href: tournamentPath(t),
      }),
    ),
    ...matches.flatMap((m): ActivityItem[] => {
      const winner = m.winnerId === m.playerA.id ? m.playerA : m.playerB;
      const loser = m.winnerId === m.playerA.id ? m.playerB : m.playerA;
      const reports = [m.resultA, m.resultB].filter(Boolean) as unknown as Result[];
      const score = reports.find((r) => r.winnerId === m.winnerId && r.winnerId !== DRAW_RESULT)?.score;
      return [
        {
          id: `m-${m.id}`,
          at: m.updatedAt,
          kind: "result",
          title: `${winner.displayName} beat ${loser.displayName}`,
          detail: [score, m.tournament?.name ?? (m.battle ? `${m.battle.game} challenge` : null)].filter(Boolean).join(" · ") || null,
          href: `/matches/${m.id}`,
        },
      ];
    }),
    ...communities.map(
      (c): ActivityItem => ({ id: `c-${c.id}`, at: c.createdAt, kind: "community", title: `New community: ${c.name}`, detail: null, href: communityHref(c) }),
    ),
  ];

  return items.sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, take);
}
