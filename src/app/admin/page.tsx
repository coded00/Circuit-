/**
 * Circuit — Admin Overview: what needs staff today, then the numbers.
 *
 * 1. Needs attention — every queue that's waiting on staff, with counts:
 *    escalated match disputes and lobby flags, open abuse and community
 *    reports, open appeals, prize payouts and withdrawals still
 *    processing, refunds that failed or are stuck, tournaments with
 *    frozen funds. Empty queues collapse
 *    into a single "All clear".
 * 2. Key numbers — users, live/open competitions, open challenges and
 *    entry-fee volume, each with its last-7-days change.
 * 3. The last 7 days by day (a plain table — honest at any volume, unlike
 *    a bar chart of single-digit counts) and recent activity.
 *
 * "Entry-fee volume" is gross completed ENTRY_FEE money — Circuit's own
 * cut (PLATFORM_FEE) is on Finance with the rest of the money detail.
 * Every number is a live query.
 */

import Link from "next/link";
import { ArrowUpRight, CheckCircle2 } from "lucide-react";
import { prisma } from "@/lib/db";
import { EmptyState, naira, PageHeader, Panel, Section, StatStrip, StatusBadge } from "@/components/admin/ui";

function timeAgo(date: Date): string {
  const min = Math.floor((Date.now() - date.getTime()) / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

// Local calendar day (the same clock the row labels use), not the UTC date.
const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

export default async function AdminOverviewPage() {
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() - 6);
  weekStart.setHours(0, 0, 0, 0);

  const [
    userCount,
    activeCompetitions,
    liveCompetitions,
    openChallenges,
    entryFees,
    weekEntryFees,
    escalatedDisputes,
    escalatedFlags,
    openReports,
    openCommunityReports,
    openAppeals,
    pendingPayouts,
    pendingWithdrawals,
    failedRefunds,
    stuckRefunds,
    frozenTournaments,
    recentRegistrations,
    recentBattles,
    recentWalletTx,
    weekUsers,
    weekRegistrations,
    weekBattles,
    cardRefundsFailed,
    cardRefundsStuck,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.tournament.count({ where: { status: { in: ["OPEN", "LIVE"] } } }),
    prisma.tournament.count({ where: { status: "LIVE" } }),
    prisma.battle.count({ where: { status: "OPEN" } }),
    prisma.escrowTransaction.aggregate({ where: { type: "ENTRY_FEE", status: "COMPLETE" }, _sum: { amount: true } }),
    prisma.escrowTransaction.aggregate({ where: { type: "ENTRY_FEE", status: "COMPLETE", createdAt: { gte: weekStart } }, _sum: { amount: true } }),
    prisma.dispute.count({ where: { status: "ESCALATED" } }),
    prisma.lobbyFlag.count({ where: { status: "ESCALATED" } }),
    prisma.report.count({ where: { status: "OPEN" } }),
    prisma.communityReport.count({ where: { status: { in: ["OPEN", "ESCALATED"] } } }),
    prisma.appeal.count({ where: { status: "OPEN" } }),
    prisma.escrowTransaction.aggregate({ where: { type: "PRIZE_PAYOUT", status: "PENDING" }, _count: true, _sum: { amount: true } }),
    prisma.walletTransaction.aggregate({ where: { type: "WITHDRAWAL", status: "PENDING" }, _count: true, _sum: { amount: true } }),
    prisma.escrowTransaction.aggregate({ where: { type: "REFUND", status: "FAILED" }, _count: true, _sum: { amount: true } }),
    prisma.escrowTransaction.count({ where: { type: "REFUND", status: "PENDING", createdAt: { lt: new Date(now.getTime() - 24 * 60 * 60_000) } } }),
    prisma.tournament.count({ where: { fundsFrozen: true, status: { not: "CANCELLED" } } }),
    prisma.registration.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { user: { select: { displayName: true } }, tournament: { select: { id: true, name: true } } },
    }),
    prisma.battle.findMany({ orderBy: { createdAt: "desc" }, take: 8, include: { creator: { select: { displayName: true } } } }),
    prisma.walletTransaction.findMany({
      where: { status: "COMPLETE", type: { in: ["FUND", "WITHDRAWAL"] } },
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { user: { select: { displayName: true } } },
    }),
    prisma.user.findMany({ where: { createdAt: { gte: weekStart } }, select: { createdAt: true } }),
    prisma.registration.findMany({ where: { createdAt: { gte: weekStart } }, select: { createdAt: true } }),
    prisma.battle.findMany({ where: { createdAt: { gte: weekStart } }, select: { createdAt: true } }),
    prisma.order.count({ where: { paymentMethod: "CARD", status: "CANCELLED", refundStatus: "FAILED" } }),
    prisma.order.count({ where: { paymentMethod: "CARD", status: "CANCELLED", refundStatus: "PENDING", updatedAt: { lt: new Date(now.getTime() - 5 * 24 * 60 * 60_000) } } }),
  ]);

  const queues = [
    { label: "Escalated match disputes", count: escalatedDisputes, href: "/admin/disputes", tone: "danger" as const },
    { label: "Escalated lobby result flags", count: escalatedFlags, href: "/admin/disputes?tab=flags", tone: "danger" as const },
    { label: "Open abuse reports", count: openReports, href: "/admin/reports", tone: "attention" as const },
    { label: "Open community reports", count: openCommunityReports, href: "/admin/reports?tab=communities", tone: "attention" as const },
    { label: "Open appeals", count: openAppeals, href: "/admin/reports?tab=appeals", tone: "attention" as const },
    {
      label: "Prize payouts processing",
      count: pendingPayouts._count,
      detail: pendingPayouts._count ? naira(pendingPayouts._sum.amount ?? 0) : undefined,
      href: "/admin/finance?tab=escrow&etype=PRIZE_PAYOUT&estatus=PENDING",
      tone: "attention" as const,
    },
    {
      label: "Withdrawals processing",
      count: pendingWithdrawals._count,
      detail: pendingWithdrawals._count ? naira(pendingWithdrawals._sum.amount ?? 0) : undefined,
      href: "/admin/finance?type=WITHDRAWAL&status=PENDING",
      tone: "attention" as const,
    },
    {
      // Paystack refused the refund: no automatic retry, a person has to sort it out.
      label: "Refunds that failed",
      count: failedRefunds._count,
      detail: failedRefunds._count ? naira(failedRefunds._sum.amount ?? 0) : undefined,
      href: "/admin/finance?tab=escrow&etype=REFUND&estatus=FAILED",
      tone: "danger" as const,
    },
    {
      label: "Refunds processing over a day",
      count: stuckRefunds,
      href: "/admin/finance?tab=escrow&etype=REFUND&estatus=PENDING",
      tone: "attention" as const,
    },
    {
      // The card refund for a cancelled Marketplace order was refused: staff retry it from the orders page.
      label: "Marketplace card refunds that failed",
      count: cardRefundsFailed,
      href: "/admin/marketplace/orders?show=cancelled",
      tone: "danger" as const,
    },
    {
      label: "Marketplace card refunds pending over 5 days",
      count: cardRefundsStuck,
      href: "/admin/marketplace/orders?show=cancelled",
      tone: "attention" as const,
    },
    { label: "Tournaments with frozen funds", count: frozenTournaments, href: "/admin/competitions?frozen=1", tone: "neutral" as const },
  ];
  const waiting = queues.filter((q) => q.count > 0);

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });
  const tally = (rows: { createdAt: Date }[]) => {
    const m = new Map(days.map((d) => [dayKey(d), 0]));
    for (const r of rows) m.set(dayKey(r.createdAt), (m.get(dayKey(r.createdAt)) ?? 0) + 1);
    return m;
  };
  const usersByDay = tally(weekUsers);
  const regsByDay = tally(weekRegistrations);
  const battlesByDay = tally(weekBattles);

  const activity = [
    ...recentRegistrations.map((r) => ({
      id: `reg-${r.id}`,
      kind: "Registration",
      text: (
        <>
          <span className="text-foreground">{r.user.displayName}</span> joined{" "}
          <Link href={`/admin/competitions/${r.tournament.id}`} className="text-foreground hover:underline">
            {r.tournament.name}
          </Link>
        </>
      ),
      date: r.createdAt,
    })),
    ...recentBattles.map((b) => ({
      id: `battle-${b.id}`,
      kind: "Challenge",
      text: (
        <>
          <span className="text-foreground">{b.creator.displayName}</span> opened a{" "}
          <Link href={`/admin/challenges/${b.id}`} className="text-foreground hover:underline">
            {b.game} challenge
          </Link>
        </>
      ),
      date: b.createdAt,
    })),
    ...recentWalletTx.map((t) => ({
      id: `wtx-${t.id}`,
      kind: t.type === "FUND" ? "Deposit" : "Withdrawal",
      text: (
        <>
          <span className="text-foreground">{t.user.displayName}</span> {t.type === "FUND" ? "deposited" : "withdrew"}{" "}
          <span className="font-mono text-foreground">{naira(t.amount)}</span>
        </>
      ),
      date: t.createdAt,
    })),
  ]
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .slice(0, 10);

  return (
    <>
      <PageHeader
        title="Overview"
        description={now.toLocaleDateString("en-NG", { weekday: "long", day: "numeric", month: "long" })}
      />

      <Section title="Needs attention">
        {waiting.length === 0 ? (
          <Panel className="flex items-center gap-2.5 !py-3.5">
            <CheckCircle2 size={16} className="text-success" />
            <span className="text-[13px] text-muted">All clear. No disputes, reports, appeals or payouts waiting on staff.</span>
          </Panel>
        ) : (
          <Panel padded={false}>
            {waiting.map((q) => (
              <Link
                key={q.label}
                href={q.href}
                className="group flex items-center justify-between gap-3 border-b border-border px-4 py-3 transition-colors last:border-b-0 hover:bg-surface-elevated sm:px-5"
              >
                <span className="flex items-center gap-3 text-[13px] text-foreground">
                  <StatusBadge tone={q.tone}>{q.count}</StatusBadge>
                  {q.label}
                  {q.detail && <span className="font-mono text-[12px] text-muted">{q.detail}</span>}
                </span>
                <ArrowUpRight size={15} className="text-muted-strong transition-colors group-hover:text-foreground" />
              </Link>
            ))}
          </Panel>
        )}
      </Section>

      <StatStrip
        stats={[
          { label: "Users", value: userCount.toLocaleString("en-NG"), hint: `+${weekUsers.length} this week`, href: "/admin/users" },
          {
            label: "Open & live competitions",
            value: activeCompetitions.toLocaleString("en-NG"),
            hint: `${liveCompetitions} live now`,
            href: "/admin/competitions",
          },
          { label: "Open challenges", value: openChallenges.toLocaleString("en-NG"), hint: `+${weekBattles.length} this week`, href: "/admin/challenges" },
          {
            label: "Entry-fee volume",
            value: naira(entryFees._sum.amount ?? 0),
            hint: `+${naira(weekEntryFees._sum.amount ?? 0)} this week`,
            href: "/admin/finance",
          },
        ]}
      />

      <div className="grid grid-cols-1 gap-8 xl:grid-cols-[1fr_1.15fr]">
        <Section title="Last 7 days">
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Day</th>
                  <th className="text-right">Users</th>
                  <th className="text-right">Registrations</th>
                  <th className="text-right">Challenges</th>
                </tr>
              </thead>
              <tbody>
                {[...days].reverse().map((d) => {
                  const k = dayKey(d);
                  const today = k === dayKey(now);
                  return (
                    <tr key={k}>
                      <td className="text-muted">
                        {today ? <span className="text-foreground">Today</span> : `${d.toLocaleDateString("en-NG", { weekday: "short" })} ${d.getDate()}`}
                      </td>
                      {[usersByDay, regsByDay, battlesByDay].map((m, i) => {
                        const n = m.get(k) ?? 0;
                        return (
                          <td key={i} className={`text-right font-mono ${n ? "text-foreground" : "text-muted-strong"}`}>
                            {n}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Section>

        <Section title="Recent activity">
          {activity.length === 0 ? (
            <EmptyState title="No activity yet" description="Registrations, challenges, deposits and withdrawals show up here as they happen." />
          ) : (
            <Panel padded={false}>
              {activity.map((item) => (
                <div key={item.id} className="flex items-center gap-3 border-b border-border px-4 py-2.5 last:border-b-0 sm:px-5">
                  <span className="w-[76px] shrink-0 text-[11px] font-medium text-muted-strong">{item.kind}</span>
                  <span className="min-w-0 flex-1 truncate text-[13px] text-muted">{item.text}</span>
                  <span className="shrink-0 text-[12px] text-muted-strong tabular-nums">{timeAgo(item.date)}</span>
                </div>
              ))}
            </Panel>
          )}
        </Section>
      </div>
    </>
  );
}
