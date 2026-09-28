/**
 * Circuit — Admin Users (Phase 1). Every column is a real field or a
 * real aggregate: Status is `User.isSuspended`, Matches/Wins are counted
 * from the real `Match` relations, Wallet is the real `walletBalance`,
 * Joined is the real `createdAt`. The Game filter matches any user with
 * at least one registration or created Battle for that (free-text) game
 * — Circuit has no Game catalog, so this is a `contains` match against
 * real tournament/battle rows, same as `/compete`'s own Game filter.
 */

import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { Avatar, EmptyState, Field, FilterBar, naira, PageHeader, Pagination, plural, StatusBadge } from "@/components/admin/ui";
import { RowLink } from "@/components/admin/ui-client";

const PAGE_SIZE = 25;

type SearchParams = {
  q?: string;
  status?: string;
  game?: string;
  from?: string;
  to?: string;
  page?: string;
};

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" });
}

export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { q, status, game, from, to, page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);

  const and: Prisma.UserWhereInput[] = [];
  if (q?.trim()) {
    const term = q.trim();
    and.push({
      OR: [
        { displayName: { contains: term, mode: "insensitive" } },
        { handle: { contains: term, mode: "insensitive" } },
        { emailOrPhone: { contains: term, mode: "insensitive" } },
      ],
    });
  }
  if (status === "active") and.push({ isSuspended: false });
  if (status === "suspended") and.push({ isSuspended: true });
  if (game?.trim()) {
    const term = game.trim();
    and.push({
      OR: [
        { registrations: { some: { tournament: { game: { contains: term, mode: "insensitive" } } } } },
        { battlesCreated: { some: { game: { contains: term, mode: "insensitive" } } } },
      ],
    });
  }
  if (from) and.push({ createdAt: { gte: new Date(from) } });
  if (to) {
    const toDate = new Date(to);
    toDate.setHours(23, 59, 59, 999);
    and.push({ createdAt: { lte: toDate } });
  }
  const where: Prisma.UserWhereInput = and.length ? { AND: and } : {};

  const [total, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        displayName: true,
        handle: true,
        avatarUrl: true,
        isSuspended: true,
        walletBalance: true,
        createdAt: true,
        _count: { select: { matchesAsPlayerA: true, matchesAsPlayerB: true, matchesWon: true } },
      },
    }),
  ]);

  const hasFilters = !!(q || status || game || from || to);

  function pageHref(nextPage: number): string {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (status) params.set("status", status);
    if (game) params.set("game", game);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (nextPage > 1) params.set("page", String(nextPage));
    const qs = params.toString();
    return qs ? `/admin/users?${qs}` : "/admin/users";
  }

  return (
    <>
      <PageHeader title="Users" description={`${plural(total, "account")}${hasFilters ? " match these filters" : " on Circuit"}.`} />

      <FilterBar
        extra={
          hasFilters && (
            <Link href="/admin/users" className="text-[12px] font-medium text-muted hover:text-foreground">
              Clear
            </Link>
          )
        }
      >
        <Field label="Search" grow htmlFor="q">
          <input id="q" name="q" defaultValue={q ?? ""} placeholder="Name, handle or email" className="field-input" />
        </Field>
        <Field label="Status" htmlFor="status">
          <select id="status" name="status" defaultValue={status ?? ""} className="field-select">
            <option value="">Any status</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
          </select>
        </Field>
        <Field label="Game" htmlFor="game">
          <input id="game" name="game" defaultValue={game ?? ""} placeholder="e.g. Valorant" className="field-input" />
        </Field>
        <Field label="Joined from" htmlFor="from">
          <input id="from" name="from" type="date" defaultValue={from ?? ""} className="field-input" />
        </Field>
        <Field label="Joined to" htmlFor="to">
          <input id="to" name="to" type="date" defaultValue={to ?? ""} className="field-input" />
        </Field>
      </FilterBar>

      {users.length === 0 ? (
        <EmptyState title={hasFilters ? "No users match these filters" : "No users yet"} description={hasFilters ? "Try a broader search or clear the filters." : undefined} />
      ) : (
        <div className="flex flex-col gap-3">
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Player</th>
                  <th>Status</th>
                  <th className="text-right">Matches</th>
                  <th className="text-right">Wins</th>
                  <th className="text-right">Wallet</th>
                  <th className="text-right">Joined</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const matches = u._count.matchesAsPlayerA + u._count.matchesAsPlayerB;
                  return (
                    <RowLink key={u.id} href={`/admin/users/${u.id}`}>
                      <td>
                        <Link href={`/admin/users/${u.id}`} className="flex items-center gap-2.5">
                          <Avatar name={u.displayName} src={u.avatarUrl} />
                          <span className="flex min-w-0 flex-col leading-tight">
                            <span className="truncate font-medium text-foreground">{u.displayName}</span>
                            <span className="truncate text-[12px] text-muted">@{u.handle}</span>
                          </span>
                        </Link>
                      </td>
                      <td>
                        <StatusBadge tone={u.isSuspended ? "danger" : "success"} dot>
                          {u.isSuspended ? "Suspended" : "Active"}
                        </StatusBadge>
                      </td>
                      <td className="text-right font-mono">{matches}</td>
                      <td className="text-right font-mono">{u._count.matchesWon}</td>
                      <td className="text-right font-mono">{naira(u.walletBalance)}</td>
                      <td className="text-right text-muted">{formatDate(u.createdAt)}</td>
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
