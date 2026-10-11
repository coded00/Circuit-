/**
 * Circuit — Admin Challenges (Phase 3). Every real Battle. "Challenger"
 * isn't a field on Battle itself (only `creatorId`/`targetUserId` for a
 * targeted invite) — once someone accepts an open Battle, `createBattleMatch`
 * (src/lib/matches.ts) creates the real Match that pairs them with the
 * creator, so the challenger here is read off that Match's non-creator
 * player, real data derived from a real relation, not a fabricated column.
 */

import Link from "next/link";
import type { Prisma, BattleStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { battleStatusInfo } from "@/components/StatusPill";
import { EmptyState, Field, FilterBar, naira, PageHeader, Pagination, StatusBadge, SubNav, toneFor } from "@/components/admin/ui";
import { RowLink } from "@/components/admin/ui-client";
import { DailyChallengesAdminList } from "@/components/admin/DailyChallengesAdminList";

type SearchParams = { q?: string; status?: string; page?: string; kind?: string; tab?: string };

const PAGE_SIZE = 30;

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" });
}

const STATUS_OPTIONS: { value: BattleStatus | ""; label: string }[] = [
  { value: "", label: "Any status" },
  { value: "OPEN", label: "Open" },
  { value: "ACCEPTED", label: "Active" },
  { value: "COMPLETE", label: "Completed" },
  { value: "CANCELLED", label: "Cancelled" },
];

export default async function AdminChallengesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { q, status, page: pageParam, kind, tab } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);

  const and: Prisma.BattleWhereInput[] = [];
  if (q?.trim()) and.push({ game: { contains: q.trim(), mode: "insensitive" } });
  if (status) and.push({ status: status as BattleStatus });
  const where: Prisma.BattleWhereInput = and.length ? { AND: and } : {};

  const [total, quickMatchCount, dailyCount, battles] = await Promise.all([
    prisma.battle.count({ where }),
    prisma.quickMatchChallenge.count(),
    prisma.dailyChallenge.count(),
    prisma.battle.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    include: {
      creator: { select: { displayName: true } },
      matches: {
        take: 1,
        include: {
          playerA: { select: { displayName: true } },
          playerB: { select: { displayName: true } },
        },
      },
    },
  }),
  ]);

  // Daily Challenges are a tab of this same page, with the same sub-navigation.
  if (kind === "daily") {
    return (
      <DailyChallengesAdminList
        tab={tab}
        page={pageParam}
        subNav={
          <SubNav
            active="daily"
            items={[
              { key: "challenges", label: "Head-to-head", href: "/admin/challenges", count: total },
              { key: "daily", label: "Daily", href: "/admin/challenges?kind=daily", count: dailyCount },
              { key: "quick", label: "Quick Matches", href: "/admin/quick-matches", count: quickMatchCount },
            ]}
          />
        }
      />
    );
  }

  const hasFilters = !!(q || status);
  const pageHref = (n: number) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (status) params.set("status", status);
    if (n > 1) params.set("page", String(n));
    const qs = params.toString();
    return qs ? `/admin/challenges?${qs}` : "/admin/challenges";
  };

  return (
    <>
      <PageHeader title="Challenges" description="Player-vs-player matches outside tournaments. Open challenges and Quick Matches." />
      <SubNav
        active="challenges"
        items={[
          { key: "challenges", label: "Head-to-head", href: "/admin/challenges", count: total },
          { key: "daily", label: "Daily", href: "/admin/challenges?kind=daily", count: dailyCount },
          { key: "quick", label: "Quick Matches", href: "/admin/quick-matches", count: quickMatchCount },
        ]}
      />

      <FilterBar
        extra={
          hasFilters && (
            <Link href="/admin/challenges" className="text-[12px] font-medium text-muted hover:text-foreground">
              Clear
            </Link>
          )
        }
      >
        <Field label="Game" grow htmlFor="q">
          <input id="q" name="q" defaultValue={q ?? ""} placeholder="e.g. Valorant" className="field-input" />
        </Field>
        <Field label="Status" htmlFor="status">
          <select id="status" name="status" defaultValue={status ?? ""} className="field-select">
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
      </FilterBar>

      {battles.length === 0 ? (
        <EmptyState title={hasFilters ? "No challenges match these filters" : "No challenges yet"} description={hasFilters ? "Try a broader search or clear the filters." : undefined} />
      ) : (
        <div className="flex flex-col gap-3">
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Game</th>
                  <th>Host</th>
                  <th>Challenger</th>
                  <th className="text-right">Stake</th>
                  <th>Status</th>
                  <th className="text-right">Created</th>
                </tr>
              </thead>
              <tbody>
                {battles.map((b) => {
                  const statusInfo = battleStatusInfo(b.status);
                  const match = b.matches[0];
                  const challenger = match ? (match.playerAId === b.creatorId ? match.playerB.displayName : match.playerA.displayName) : null;
                  return (
                    <RowLink key={b.id} href={`/admin/challenges/${b.id}`}>
                      <td>
                        <Link href={`/admin/challenges/${b.id}`} className="font-medium text-foreground">
                          {b.game}
                        </Link>
                      </td>
                      <td className="text-muted">{b.creator.displayName}</td>
                      <td className="text-muted">{challenger ?? "—"}</td>
                      <td className="text-right">{b.stakeAmount === 0 ? <span className="text-muted">Free</span> : naira(b.stakeAmount)}</td>
                      <td>
                        <StatusBadge tone={toneFor(statusInfo.tone)} dot={statusInfo.pulse}>
                          {statusInfo.label}
                        </StatusBadge>
                      </td>
                      <td className="text-right text-muted">{formatDate(b.createdAt)}</td>
                    </RowLink>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pagination page={page} pageSize={PAGE_SIZE} total={total} href={pageHref} />
        </div>
      )}
    </>
  );
}
