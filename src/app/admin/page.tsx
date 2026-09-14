/**
 * Circuit — Admin Overview. The first thing an admin sees: four real
 * top-line numbers, a real recent-activity feed, and a lightweight
 * 7-day activity snapshot. Every number here is a live query — nothing
 * on this page is mocked or illustrative.
 *
 * "Revenue" is the one metric worth a note: Circuit's schema has no
 * platform-commission/fee field anywhere (`EscrowTransaction` moves
 * entry fees and prize payouts, but the platform doesn't currently take
 * a cut of either) — so there's no real "take-home revenue" number to
 * show. What IS real and shown here instead is gross entry-fee volume:
 * the sum of every completed `EscrowTransaction` of type `ENTRY_FEE`,
 * i.e. total real money that has moved through paid tournament entries.
 * Honest under the label the product spec asked for, not a fabricated
 * commission calculation.
 *
 * "Competition completed" (an activity-feed line the spec's example
 * copy showed) is deliberately not one of the feed types below —
 * `Tournament` has no `completedAt`/`updatedAt` field, only `createdAt`,
 * so there's no real timestamp for "when this was marked complete" to
 * sort or label by. The feed below only uses event types with a real,
 * meaningful timestamp: registrations, challenges, and wallet activity.
 */

import { prisma } from "@/lib/db";
import { Users, Trophy, Swords, Banknote, UserPlus, Wallet, ArrowDownToLine } from "lucide-react";

function formatNaira(kobo: number): string {
  return `₦${(kobo / 100).toLocaleString("en-NG")}`;
}

function timeAgo(date: Date): string {
  const ms = Date.now() - date.getTime();
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.floor(hr / 24);
  return `${days}d ago`;
}

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

type ActivityItem = { id: string; message: string; date: Date };

export default async function AdminOverviewPage() {
  const now = new Date();
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
  sevenDaysAgo.setHours(0, 0, 0, 0);

  const [
    userCount,
    activeCompetitions,
    openChallenges,
    entryFeeRevenue,
    recentRegistrations,
    recentBattles,
    recentWalletTx,
    weekUsers,
    weekRegistrations,
    weekBattles,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.tournament.count({ where: { status: { in: ["OPEN", "LIVE"] } } }),
    prisma.battle.count({ where: { status: "OPEN" } }),
    prisma.escrowTransaction.aggregate({
      where: { type: "ENTRY_FEE", status: "COMPLETE" },
      _sum: { amount: true },
    }),
    prisma.registration.findMany({
      orderBy: { createdAt: "desc" },
      take: 6,
      include: { user: { select: { displayName: true } }, tournament: { select: { name: true } } },
    }),
    prisma.battle.findMany({
      orderBy: { createdAt: "desc" },
      take: 6,
      include: { creator: { select: { displayName: true } } },
    }),
    prisma.walletTransaction.findMany({
      where: { status: "COMPLETE", type: { in: ["FUND", "WITHDRAWAL"] } },
      orderBy: { createdAt: "desc" },
      take: 6,
      include: { user: { select: { displayName: true } } },
    }),
    prisma.user.findMany({ where: { createdAt: { gte: sevenDaysAgo } }, select: { createdAt: true } }),
    prisma.registration.findMany({ where: { createdAt: { gte: sevenDaysAgo } }, select: { createdAt: true } }),
    prisma.battle.findMany({ where: { createdAt: { gte: sevenDaysAgo } }, select: { createdAt: true } }),
  ]);

  const metrics = [
    { label: "Users", value: userCount.toLocaleString("en-NG"), icon: Users },
    { label: "Active Competitions", value: activeCompetitions.toLocaleString("en-NG"), icon: Trophy },
    { label: "Open Challenges", value: openChallenges.toLocaleString("en-NG"), icon: Swords },
    { label: "Revenue", value: formatNaira(entryFeeRevenue._sum.amount ?? 0), icon: Banknote },
  ];

  const activity: ActivityItem[] = [
    ...recentRegistrations.map((r) => ({
      id: `reg-${r.id}`,
      message: `${r.user.displayName} joined ${r.tournament.name}`,
      date: r.createdAt,
    })),
    ...recentBattles.map((b) => ({
      id: `battle-${b.id}`,
      message: `${b.creator.displayName} created a new ${b.game} challenge`,
      date: b.createdAt,
    })),
    ...recentWalletTx.map((t) => ({
      id: `wtx-${t.id}`,
      message:
        t.type === "FUND"
          ? `${formatNaira(t.amount)} deposited by ${t.user.displayName}`
          : `${formatNaira(t.amount)} withdrawn by ${t.user.displayName}`,
      date: t.createdAt,
    })),
  ]
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .slice(0, 8);

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(sevenDaysAgo);
    d.setDate(d.getDate() + i);
    return d;
  });
  const buckets = new Map<string, number>();
  for (const d of days) buckets.set(dayKey(d), 0);
  for (const row of [...weekUsers, ...weekRegistrations, ...weekBattles]) {
    const key = dayKey(row.createdAt);
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  const snapshot = days.map((d) => ({ date: d, count: buckets.get(dayKey(d)) ?? 0 }));
  const maxCount = Math.max(1, ...snapshot.map((s) => s.count));

  return (
    <div className="flex flex-1 flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-bold tracking-tight">Overview</h1>
        <p className="text-sm text-muted">What&apos;s happening on Circuit right now.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((m) => (
          <div key={m.label} className="card flex items-center gap-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent-volt-soft text-accent-volt">
              <m.icon size={19} />
            </span>
            <div className="flex flex-col">
              <span className="text-xs font-medium text-muted">{m.label}</span>
              <span className="font-display text-2xl font-bold tracking-tight">{m.value}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.1fr_1fr]">
        <div className="card flex flex-col gap-4">
          <h2 className="text-card-title">Recent Activity</h2>
          {activity.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted">Nothing yet.</p>
          ) : (
            <div className="flex flex-col">
              {activity.map((item, i) => {
                const Icon = item.message.includes("deposited")
                  ? Wallet
                  : item.message.includes("withdrawn")
                    ? ArrowDownToLine
                    : item.message.includes("challenge")
                      ? Swords
                      : UserPlus;
                return (
                  <div
                    key={item.id}
                    className={`flex items-center gap-3 py-3 ${i > 0 ? "border-t border-border" : ""}`}
                  >
                    <Icon size={15} className="shrink-0 text-muted" />
                    <span className="min-w-0 flex-1 truncate text-sm">{item.message}</span>
                    <span className="shrink-0 text-xs text-muted-strong">{timeAgo(item.date)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="card flex flex-col gap-4">
          <h2 className="text-card-title">Platform Snapshot</h2>
          <p className="text-xs text-muted">New users, registrations, and challenges — last 7 days.</p>
          <div className="flex flex-1 items-end justify-between gap-2 pt-2">
            {snapshot.map((s) => (
              <div key={dayKey(s.date)} className="flex flex-1 flex-col items-center gap-2">
                <div className="flex h-24 w-full items-end">
                  <div
                    className="w-full rounded-t-[4px] bg-accent-volt"
                    style={{ height: `${Math.max(6, (s.count / maxCount) * 100)}%` }}
                  />
                </div>
                <span className="text-[10px] text-muted-strong">
                  {s.date.toLocaleDateString("en-NG", { weekday: "narrow" })}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
