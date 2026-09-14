/**
 * Circuit — Admin user detail (Phase 1). Real activity only: registrations,
 * matches (with real opponent + win/loss derived from `Match.winnerId`),
 * Battles created, and the wallet transaction ledger — the same four
 * relations `User` already exposes, just surfaced for staff instead of
 * only the player themselves.
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { StatusPill, registrationStatusInfo, matchStatusInfo, battleStatusInfo } from "@/components/StatusPill";
import { SuspendControl } from "@/components/admin/SuspendControl";

function formatNaira(kobo: number): string {
  return `₦${(kobo / 100).toLocaleString("en-NG")}`;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" });
}

function walletTypeLabel(type: string): string {
  if (type === "FUND") return "Deposit";
  if (type === "WITHDRAWAL") return "Withdrawal";
  return "Entry fee";
}

export default async function AdminUserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const user = await prisma.user.findUnique({
    where: { id },
    include: {
      _count: { select: { matchesAsPlayerA: true, matchesAsPlayerB: true, matchesWon: true, registrations: true, battlesCreated: true } },
    },
  });
  if (!user) notFound();

  const [registrations, matches, battles, walletTx] = await Promise.all([
    prisma.registration.findMany({
      where: { userId: id },
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { tournament: { select: { id: true, name: true, game: true } } },
    }),
    prisma.match.findMany({
      where: { OR: [{ playerAId: id }, { playerBId: id }] },
      orderBy: { createdAt: "desc" },
      take: 8,
      include: {
        playerA: { select: { displayName: true } },
        playerB: { select: { displayName: true } },
        tournament: { select: { name: true } },
        battle: { select: { game: true } },
      },
    }),
    prisma.battle.findMany({ where: { creatorId: id }, orderBy: { createdAt: "desc" }, take: 8 }),
    prisma.walletTransaction.findMany({ where: { userId: id }, orderBy: { createdAt: "desc" }, take: 8 }),
  ]);

  const totalMatches = user._count.matchesAsPlayerA + user._count.matchesAsPlayerB;

  return (
    <div className="flex flex-1 flex-col gap-6">
      <Link href="/admin/users" className="w-fit text-sm font-medium text-muted transition hover:text-foreground">
        ← All users
      </Link>

      <div className="card flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          {user.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- external, unpredictable-host avatar URLs
            <img src={user.avatarUrl} alt="" className="h-14 w-14 rounded-full object-cover" />
          ) : (
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-elevated text-lg font-semibold text-muted">
              {user.displayName.slice(0, 1).toUpperCase()}
            </div>
          )}
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-2">
              <span className="font-display text-lg font-bold">{user.displayName}</span>
              <span className={`badge ${user.isSuspended ? "badge-cancelled" : "badge-open"}`}>
                {user.isSuspended ? "Suspended" : "Active"}
              </span>
            </div>
            <span className="text-sm text-muted">
              @{user.handle} · {user.emailOrPhone}
            </span>
            <span className="text-xs text-muted-strong">Joined {formatDate(user.createdAt)}</span>
          </div>
        </div>
        <SuspendControl userId={user.id} isSuspended={user.isSuspended} suspensionReason={user.suspensionReason} />
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="widget flex flex-col gap-1">
          <span className="text-eyebrow">Matches</span>
          <span className="text-stat text-2xl">{totalMatches}</span>
        </div>
        <div className="widget flex flex-col gap-1">
          <span className="text-eyebrow">Wins</span>
          <span className="text-stat text-2xl">{user._count.matchesWon}</span>
        </div>
        <div className="widget flex flex-col gap-1">
          <span className="text-eyebrow">Competitions</span>
          <span className="text-stat text-2xl">{user._count.registrations}</span>
        </div>
        <div className="widget flex flex-col gap-1">
          <span className="text-eyebrow">Wallet balance</span>
          <span className="text-stat text-2xl">{formatNaira(user.walletBalance)}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div className="card flex flex-col gap-3">
          <h2 className="text-card-title">Competitions</h2>
          {registrations.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">No competitions joined yet.</p>
          ) : (
            <div className="flex flex-col">
              {registrations.map((r, i) => {
                const status = registrationStatusInfo(r.status);
                return (
                  <Link
                    key={r.id}
                    href={`/admin/competitions/${r.tournament.id}`}
                    className={`flex items-center justify-between gap-3 py-2.5 text-sm hover:text-accent-volt ${i > 0 ? "border-t border-border" : ""}`}
                  >
                    <span className="min-w-0 flex-1 truncate">{r.tournament.name}</span>
                    <StatusPill tone={status.tone}>{status.label}</StatusPill>
                    <span className="w-20 shrink-0 text-right text-xs text-muted-strong">{formatDate(r.createdAt)}</span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        <div className="card flex flex-col gap-3">
          <h2 className="text-card-title">Matches</h2>
          {matches.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">No matches yet.</p>
          ) : (
            <div className="flex flex-col">
              {matches.map((m, i) => {
                const isPlayerA = m.playerAId === id;
                const opponent = isPlayerA ? m.playerB.displayName : m.playerA.displayName;
                const status = matchStatusInfo(m.status);
                const outcome = m.winnerId ? (m.winnerId === id ? "Won" : "Lost") : null;
                return (
                  <div key={m.id} className={`flex items-center justify-between gap-3 py-2.5 text-sm ${i > 0 ? "border-t border-border" : ""}`}>
                    <span className="min-w-0 flex-1 truncate">
                      vs {opponent}
                      <span className="ml-1.5 text-xs text-muted">{m.tournament?.name ?? m.battle?.game}</span>
                    </span>
                    {outcome ? (
                      <span className={`badge ${outcome === "Won" ? "badge-complete" : "badge-cancelled"}`}>{outcome}</span>
                    ) : (
                      <StatusPill tone={status.tone} pulse={status.pulse}>{status.label}</StatusPill>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="card flex flex-col gap-3">
          <h2 className="text-card-title">Challenges Created</h2>
          {battles.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">No challenges created yet.</p>
          ) : (
            <div className="flex flex-col">
              {battles.map((b, i) => {
                const status = battleStatusInfo(b.status);
                return (
                  <Link
                    key={b.id}
                    href={`/admin/challenges/${b.id}`}
                    className={`flex items-center justify-between gap-3 py-2.5 text-sm hover:text-accent-volt ${i > 0 ? "border-t border-border" : ""}`}
                  >
                    <span className="min-w-0 flex-1 truncate">{b.game}</span>
                    <StatusPill tone={status.tone} pulse={status.pulse}>
                      {status.label}
                    </StatusPill>
                    <span className="w-20 shrink-0 text-right text-xs text-muted-strong">{formatDate(b.createdAt)}</span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        <div className="card flex flex-col gap-3">
          <h2 className="text-card-title">Wallet Transactions</h2>
          {walletTx.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">No wallet activity yet.</p>
          ) : (
            <div className="flex flex-col">
              {walletTx.map((t, i) => (
                <div key={t.id} className={`flex items-center justify-between gap-3 py-2.5 text-sm ${i > 0 ? "border-t border-border" : ""}`}>
                  <span className="min-w-0 flex-1 truncate">{walletTypeLabel(t.type)}</span>
                  <span className="font-mono tabular-nums">{formatNaira(t.amount)}</span>
                  <span
                    className={`badge ${
                      t.status === "COMPLETE" ? "badge-complete" : t.status === "FAILED" ? "badge-cancelled" : "badge-attention"
                    }`}
                  >
                    {t.status}
                  </span>
                  <span className="w-20 shrink-0 text-right text-xs text-muted-strong">{formatDate(t.createdAt)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
