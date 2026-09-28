/**
 * Circuit — Admin Quick Matches. Clones /admin/challenges' own shell
 * (searchParams-driven filters, StatusPill, plain-GET form) exactly, for
 * every QuickMatchChallenge.
 */

import Link from "next/link";
import type { Prisma, QuickMatchStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { quickMatchStatusInfo } from "@/components/StatusPill";
import { EmptyState, Field, FilterBar, naira, PageHeader, Pagination, StatusBadge, SubNav, toneFor } from "@/components/admin/ui";
import { RowLink } from "@/components/admin/ui-client";

type SearchParams = { q?: string; status?: string; page?: string };

const PAGE_SIZE = 30;

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" });
}

const STATUS_OPTIONS: { value: QuickMatchStatus | ""; label: string }[] = [
  { value: "", label: "Any status" },
  { value: "PENDING", label: "Searching" },
  { value: "ACCEPTED", label: "Matched" },
  { value: "EXPIRED", label: "Expired" },
  { value: "CANCELLED", label: "Cancelled" },
];

export default async function AdminQuickMatchesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { q, status, page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);

  const and: Prisma.QuickMatchChallengeWhereInput[] = [];
  if (q?.trim()) and.push({ game: { contains: q.trim(), mode: "insensitive" } });
  if (status) and.push({ status: status as QuickMatchStatus });
  const where: Prisma.QuickMatchChallengeWhereInput = and.length ? { AND: and } : {};

  const [total, battleCount, challenges] = await Promise.all([
    prisma.quickMatchChallenge.count({ where }),
    prisma.battle.count(),
    prisma.quickMatchChallenge.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    include: {
      host: { select: { displayName: true } },
      acceptedBy: { select: { displayName: true } },
      _count: { select: { recipients: true } },
    },
  }),
  ]);

  const hasFilters = !!(q || status);
  const pageHref = (n: number) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (status) params.set("status", status);
    if (n > 1) params.set("page", String(n));
    const qs = params.toString();
    return qs ? `/admin/quick-matches?${qs}` : "/admin/quick-matches";
  };

  return (
    <>
      <PageHeader title="Challenges" description="Player-vs-player matches outside tournaments — open challenges and Quick Matches." />
      <SubNav
        active="quick"
        items={[
          { key: "challenges", label: "Challenges", href: "/admin/challenges", count: battleCount },
          { key: "quick", label: "Quick Matches", href: "/admin/quick-matches", count: total },
        ]}
      />

      <FilterBar
        extra={
          hasFilters && (
            <Link href="/admin/quick-matches" className="text-[12px] font-medium text-muted hover:text-foreground">
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

      {challenges.length === 0 ? (
        <EmptyState title={hasFilters ? "No Quick Matches match these filters" : "No Quick Matches yet"} description={hasFilters ? "Try a broader search or clear the filters." : undefined} />
      ) : (
        <div className="flex flex-col gap-3">
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Game</th>
                  <th>Host</th>
                  <th className="text-right">Sent to</th>
                  <th>Accepted by</th>
                  <th className="text-right">Stake</th>
                  <th>Status</th>
                  <th className="text-right">Created</th>
                </tr>
              </thead>
              <tbody>
                {challenges.map((c) => {
                  const statusInfo = quickMatchStatusInfo(c.status);
                  return (
                    <RowLink key={c.id} href={`/admin/quick-matches/${c.id}`}>
                      <td>
                        <Link href={`/admin/quick-matches/${c.id}`} className="font-medium text-foreground">
                          {c.game}
                        </Link>
                      </td>
                      <td className="text-muted">{c.host.displayName}</td>
                      <td className="text-right text-muted">{c._count.recipients}</td>
                      <td className="text-muted">{c.acceptedBy?.displayName ?? "—"}</td>
                      <td className="text-right">{c.stakeAmount === 0 ? <span className="text-muted">Free</span> : naira(c.stakeAmount)}</td>
                      <td>
                        <StatusBadge tone={toneFor(statusInfo.tone)} dot={statusInfo.pulse}>
                          {statusInfo.label}
                        </StatusBadge>
                      </td>
                      <td className="text-right text-muted">{formatDate(c.createdAt)}</td>
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
