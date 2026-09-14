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

const PAGE_SIZE = 25;

type SearchParams = {
  q?: string;
  status?: string;
  game?: string;
  from?: string;
  to?: string;
  page?: string;
};

function formatNaira(kobo: number): string {
  return `₦${(kobo / 100).toLocaleString("en-NG")}`;
}

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

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
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
    <div className="flex flex-1 flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-bold tracking-tight">Users</h1>
        <p className="text-sm text-muted">{total.toLocaleString("en-NG")} accounts on Circuit.</p>
      </div>

      <form className="card flex flex-wrap items-end gap-3">
        <div className="flex min-w-[200px] flex-1 flex-col gap-1.5">
          <label className="field-label" htmlFor="q">
            Search
          </label>
          <input id="q" name="q" defaultValue={q ?? ""} placeholder="Name, handle, or email" className="field-input" />
        </div>
        <div className="flex min-w-[140px] flex-col gap-1.5">
          <label className="field-label" htmlFor="status">
            Status
          </label>
          <select id="status" name="status" defaultValue={status ?? ""} className="field-select">
            <option value="">Any status</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
          </select>
        </div>
        <div className="flex min-w-[140px] flex-col gap-1.5">
          <label className="field-label" htmlFor="game">
            Game
          </label>
          <input id="game" name="game" defaultValue={game ?? ""} placeholder="e.g. Valorant" className="field-input" />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="field-label" htmlFor="from">
            Joined from
          </label>
          <input id="from" name="from" type="date" defaultValue={from ?? ""} className="field-input" />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="field-label" htmlFor="to">
            Joined to
          </label>
          <input id="to" name="to" type="date" defaultValue={to ?? ""} className="field-input" />
        </div>
        <button type="submit" className="btn-primary">
          Apply
        </button>
        {hasFilters && (
          <Link href="/admin/users" className="text-xs font-medium text-accent-volt hover:underline">
            Clear filters
          </Link>
        )}
      </form>

      {users.length === 0 ? (
        <div className="card flex flex-col items-center gap-1 py-16 text-center">
          <p className="text-sm text-muted">No users match those filters.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Player</th>
                <th>Status</th>
                <th>Matches</th>
                <th>Wins</th>
                <th>Wallet</th>
                <th>Joined</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const matches = u._count.matchesAsPlayerA + u._count.matchesAsPlayerB;
                return (
                  <tr key={u.id}>
                    <td>
                      <Link href={`/admin/users/${u.id}`} className="flex items-center gap-2.5 font-medium hover:text-accent-volt">
                        {u.avatarUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element -- external, unpredictable-host avatar URLs
                          <img src={u.avatarUrl} alt="" className="h-7 w-7 shrink-0 rounded-full object-cover" />
                        ) : (
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-elevated text-xs font-semibold text-muted">
                            {u.displayName.slice(0, 1).toUpperCase()}
                          </span>
                        )}
                        <span className="flex flex-col leading-tight">
                          <span>{u.displayName}</span>
                          <span className="text-xs font-normal text-muted">@{u.handle}</span>
                        </span>
                      </Link>
                    </td>
                    <td>
                      <span className={`badge ${u.isSuspended ? "badge-cancelled" : "badge-open"}`}>
                        {u.isSuspended ? "Suspended" : "Active"}
                      </span>
                    </td>
                    <td className="font-mono tabular-nums">{matches}</td>
                    <td className="font-mono tabular-nums">{u._count.matchesWon}</td>
                    <td className="font-mono tabular-nums">{formatNaira(u.walletBalance)}</td>
                    <td className="text-muted">{formatDate(u.createdAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted">
            Page {page} of {totalPages}
          </span>
          <div className="flex items-center gap-2">
            {page > 1 && (
              <Link href={pageHref(page - 1)} className="btn-secondary px-3 py-1.5 text-xs">
                ← Previous
              </Link>
            )}
            {page < totalPages && (
              <Link href={pageHref(page + 1)} className="btn-secondary px-3 py-1.5 text-xs">
                Next →
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
