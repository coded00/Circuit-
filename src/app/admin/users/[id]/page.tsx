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
import { ArrowUpRight } from "lucide-react";
import { matchStatusInfo, battleStatusInfo } from "@/components/StatusPill";
import { Avatar, EmptyState, KeyValue, naira, PageHeader, Panel, RegistrationBadge, Section, StatStrip, StatusBadge, toneFor } from "@/components/admin/ui";
import { SuspendControl } from "@/components/admin/SuspendControl";

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" });
}

const WALLET_TYPE: Record<string, { label: string; credit: boolean }> = {
  FUND: { label: "Deposit", credit: true },
  WITHDRAWAL: { label: "Withdrawal", credit: false },
  ENTRY_FEE_DEBIT: { label: "Entry fee", credit: false },
  STAKE_DEBIT: { label: "Challenge stake", credit: false },
  STAKE_CREDIT: { label: "Challenge winnings", credit: true },
  ORGANIZER_REVENUE_CREDIT: { label: "Organizer revenue", credit: true },
};

const TX_STATUS: Record<string, { tone: "success" | "attention" | "danger"; label: string }> = {
  COMPLETE: { tone: "success", label: "Complete" },
  PENDING: { tone: "attention", label: "Processing" },
  FAILED: { tone: "danger", label: "Failed" },
};

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

  const row = "flex items-center gap-3 border-b border-border px-4 py-2.5 text-[13px] last:border-b-0 sm:px-5";

  return (
    <>
      <PageHeader
        back={{ href: "/admin/users", label: "Users" }}
        title={
          <span className="flex items-center gap-3">
            <Avatar name={user.displayName} src={user.avatarUrl} size={36} />
            {user.displayName}
          </span>
        }
        meta={
          <>
            <StatusBadge tone={user.isSuspended ? "danger" : "success"} dot>
              {user.isSuspended ? "Suspended" : "Active"}
            </StatusBadge>
            {user.adminRole && <StatusBadge tone="info">{user.adminRole === "SUPER_ADMIN" ? "Super admin" : "Moderator"}</StatusBadge>}
            <span>
              @{user.handle} · {user.emailOrPhone} · Joined {formatDate(user.createdAt)}
            </span>
          </>
        }
        actions={
          <>
            <Link href={`/players/${user.handle}`} target="_blank" className="btn-ghost">
              Public profile <ArrowUpRight size={14} />
            </Link>
            <SuspendControl userId={user.id} isSuspended={user.isSuspended} suspensionReason={null} />
          </>
        }
      />

      <StatStrip
        stats={[
          { label: "Matches", value: totalMatches, hint: `${user._count.matchesWon} won` },
          { label: "Competitions entered", value: user._count.registrations },
          { label: "Challenges created", value: user._count.battlesCreated },
          { label: "Wallet balance", value: naira(user.walletBalance) },
        ]}
      />

      <Panel>
        <KeyValue
          items={[
            { label: "Email", value: user.emailVerifiedAt ? `Verified ${formatDate(user.emailVerifiedAt)}` : "Not verified" },
            { label: "Payout account", value: user.payoutMethodRef ? "Linked" : "Not linked" },
            { label: "Age verified", value: user.ageVerified ? "Yes" : "No" },
            { label: "Region", value: user.region ?? "—" },
            { label: "Suspension reason", value: user.isSuspended ? (user.suspensionReason ?? "—") : "—" },
          ]}
        />
      </Panel>

      <div className="grid grid-cols-1 gap-8 xl:grid-cols-2">
        <Section title="Competitions">
          {registrations.length === 0 ? (
            <EmptyState title="No competitions entered" />
          ) : (
            <Panel padded={false}>
              {registrations.map((r) => (
                <Link key={r.id} href={`/admin/competitions/${r.tournament.id}`} className={`${row} transition-colors hover:bg-surface-elevated`}>
                  <span className="min-w-0 flex-1 truncate text-foreground">
                    {r.tournament.name} <span className="text-muted">· {r.tournament.game}</span>
                  </span>
                  <RegistrationBadge status={r.status} />
                  <span className="w-[88px] shrink-0 text-right text-[12px] text-muted">{formatDate(r.createdAt)}</span>
                </Link>
              ))}
            </Panel>
          )}
        </Section>

        <Section title="Matches">
          {matches.length === 0 ? (
            <EmptyState title="No matches yet" />
          ) : (
            <Panel padded={false}>
              {matches.map((m) => {
                const opponent = m.playerAId === id ? m.playerB.displayName : m.playerA.displayName;
                const status = matchStatusInfo(m.status);
                const outcome = m.winnerId ? (m.winnerId === id ? "Won" : "Lost") : null;
                return (
                  <Link key={m.id} href={`/admin/matches/${m.id}`} className={`${row} transition-colors hover:bg-surface-elevated`}>
                    <span className="min-w-0 flex-1 truncate text-foreground">
                      vs {opponent} <span className="text-muted">· {m.tournament?.name ?? m.battle?.game}</span>
                    </span>
                    {outcome ? (
                      <StatusBadge tone={outcome === "Won" ? "success" : "neutral"}>{outcome}</StatusBadge>
                    ) : (
                      <StatusBadge tone={toneFor(status.tone)} dot={status.pulse}>
                        {status.label}
                      </StatusBadge>
                    )}
                  </Link>
                );
              })}
            </Panel>
          )}
        </Section>

        <Section title="Challenges created">
          {battles.length === 0 ? (
            <EmptyState title="No challenges created" />
          ) : (
            <Panel padded={false}>
              {battles.map((b) => {
                const status = battleStatusInfo(b.status);
                return (
                  <Link key={b.id} href={`/admin/challenges/${b.id}`} className={`${row} transition-colors hover:bg-surface-elevated`}>
                    <span className="min-w-0 flex-1 truncate text-foreground">{b.game}</span>
                    <StatusBadge tone={toneFor(status.tone)} dot={status.pulse}>
                      {status.label}
                    </StatusBadge>
                    <span className="w-[88px] shrink-0 text-right text-[12px] text-muted">{formatDate(b.createdAt)}</span>
                  </Link>
                );
              })}
            </Panel>
          )}
        </Section>

        <Section
          title="Wallet activity"
          actions={
            walletTx.length > 0 && (
              <Link href={`/admin/finance?q=${encodeURIComponent(user.handle)}`} className="text-[12px] font-medium text-muted hover:text-foreground">
                All transactions →
              </Link>
            )
          }
        >
          {walletTx.length === 0 ? (
            <EmptyState title="No wallet activity" />
          ) : (
            <Panel padded={false}>
              {walletTx.map((t) => {
                const kind = WALLET_TYPE[t.type] ?? { label: t.type, credit: false };
                const st = TX_STATUS[t.status] ?? { tone: "attention" as const, label: t.status };
                return (
                  <div key={t.id} className={row}>
                    <span className="min-w-0 flex-1 truncate text-foreground">{kind.label}</span>
                    <StatusBadge tone={st.tone}>{st.label}</StatusBadge>
                    <span className={`w-[92px] shrink-0 text-right tabular-nums ${kind.credit ? "text-success" : "text-foreground"}`}>
                      {kind.credit ? "+" : "−"}
                      {naira(t.amount)}
                    </span>
                    <span className="w-[88px] shrink-0 text-right text-[12px] text-muted">{formatDate(t.createdAt)}</span>
                  </div>
                );
              })}
            </Panel>
          )}
        </Section>
      </div>
    </>
  );
}
