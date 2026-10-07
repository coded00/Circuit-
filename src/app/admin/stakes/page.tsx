/**
 * Circuit — Admin Stakes: the repeated-pair review queue.
 *
 * Every row here is a `StakePatternFlag` the sweep wrote (src/lib/
 * stakePatterns.ts) because two accounts' settled staked Battles against
 * each other tripped one of its two rules. The numbers on each panel are the
 * measurement, refreshed on every sweep while the flag is open, so a pair
 * still playing shows what they have done since staff last looked.
 *
 * This page exists because peer-to-peer staking is the one thing on Circuit
 * where two accounts can move money between themselves with the platform's
 * blessing, and the per-account limits that bound how much can move cannot
 * see who it keeps moving to. Everything here is a question, not a finding:
 * the panel is the whole evidence, and the two buttons at the bottom are the
 * whole answer. Nothing on this page suspends anyone or holds any money —
 * those actions live on the user page and are audited separately.
 */

import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { MAX_STORED_NET_KOBO } from "@/lib/stakePatterns";
import { naira, PageHeader, Pagination, Panel, StatStrip, StatusBadge, SubNav, EmptyState } from "@/components/admin/ui";
import StakePatternReview from "@/components/admin/StakePatternReview";

const PAGE_SIZE = 20;

const TABS = ["open", "closed"] as const;

type SearchParams = { tab?: string; page?: string };

/**
 * One reason code as a person reads it. Kept next to the page rather than in
 * stakePatterns.ts because it is copy for this surface, not part of what the
 * rule means — the codes themselves are the storage format.
 */
const REASON_LABEL: Record<string, string> = {
  ONE_SIDED: "One-sided record",
  HIGH_VALUE: "Large net transfer",
};

const REASON_TONE: Record<string, "attention" | "danger"> = {
  ONE_SIDED: "attention",
  HIGH_VALUE: "danger",
};

const STATUS_LABEL: Record<string, string> = {
  OPEN: "Open",
  DISMISSED: "Dismissed",
  ACTIONED: "Actioned",
};

function formatDay(date: Date): string {
  return date.toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" });
}

export default async function AdminStakesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { tab: tabParam, page: pageParam } = await searchParams;
  const tab = TABS.find((t) => t === tabParam) ?? "open";
  const page = Math.max(1, Number(pageParam) || 1);

  const where: Prisma.StakePatternFlagWhereInput = tab === "open" ? { status: "OPEN" } : { status: { not: "OPEN" } };

  const [total, openCount, closedCount, flags, openNet] = await Promise.all([
    prisma.stakePatternFlag.count({ where }),
    prisma.stakePatternFlag.count({ where: { status: "OPEN" } }),
    prisma.stakePatternFlag.count({ where: { status: { not: "OPEN" } } }),
    prisma.stakePatternFlag.findMany({
      where,
      // Oldest first on the open queue — a flag that has been waiting is the
      // one that has been waiting. Newest first on the closed list, which is
      // a record rather than a queue.
      orderBy: tab === "open" ? { createdAt: "asc" } : { reviewedAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        userA: { select: { id: true, displayName: true, handle: true, isSuspended: true } },
        userB: { select: { id: true, displayName: true, handle: true, isSuspended: true } },
        reviewedBy: { select: { displayName: true, handle: true } },
      },
    }),
    prisma.stakePatternFlag.aggregate({ where: { status: "OPEN" }, _sum: { netKobo: true } }),
  ]);

  function pageHref(nextPage: number): string {
    const params = new URLSearchParams();
    if (tab !== "open") params.set("tab", tab);
    if (nextPage > 1) params.set("page", String(nextPage));
    const qs = params.toString();
    return qs ? `/admin/stakes?${qs}` : "/admin/stakes";
  }

  return (
    <>
      <PageHeader
        title="Stakes"
        description="Pairs of accounts whose staked Battles against each other look like they are moving money one way. A queue for review, not a finding — nothing here has been actioned automatically."
      />

      <StatStrip
        stats={[
          { label: "Waiting for review", value: openCount.toLocaleString("en-NG"), tone: openCount > 0 ? "attention" : undefined },
          {
            label: "Net moved in open flags",
            // The gross figure across every open pair, which is a rough size
            // of what is under review and not a sum of money at risk — a
            // flagged pair's money has already settled to one of them.
            value: openCount > 0 ? naira(openNet._sum.netKobo ?? 0) : "—",
          },
          { label: "Reviewed", value: closedCount.toLocaleString("en-NG") },
        ]}
      />

      <SubNav
        active={tab}
        items={[
          { key: "open", label: "Open", href: "/admin/stakes", count: openCount },
          { key: "closed", label: "Reviewed", href: "/admin/stakes?tab=closed", count: closedCount },
        ]}
      />

      {flags.length === 0 ? (
        <EmptyState
          title={tab === "open" ? "Nothing waiting" : "Nothing reviewed yet"}
          description={
            tab === "open"
              ? "No pair has tripped the pattern rules in the current lookback window."
              : "Flags you and other staff close will be listed here."
          }
        />
      ) : (
        <div className="flex flex-col gap-3">
          {flags.map((flag) => {
            const winner = flag.netKobo >= 0 ? flag.userA : flag.userB;
            const loser = flag.netKobo >= 0 ? flag.userB : flag.userA;
            return (
              <Panel key={flag.id}>
                <div className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex flex-col gap-0.5">
                      <span className="flex flex-wrap items-center gap-2">
                        <Link href={`/admin/users/${flag.userA.id}`} className="text-[14px] font-semibold text-foreground hover:underline">
                          {flag.userA.displayName}
                        </Link>
                        <span className="text-[12px] text-muted">@{flag.userA.handle}</span>
                        <span className="text-[12px] text-muted-strong">and</span>
                        <Link href={`/admin/users/${flag.userB.id}`} className="text-[14px] font-semibold text-foreground hover:underline">
                          {flag.userB.displayName}
                        </Link>
                        <span className="text-[12px] text-muted">@{flag.userB.handle}</span>
                        {(flag.userA.isSuspended || flag.userB.isSuspended) && <StatusBadge tone="danger">Suspended</StatusBadge>}
                      </span>
                      <span className="text-[12px] text-muted">
                        Queued {formatDay(flag.createdAt)}
                        {flag.reviewedAt ? ` · reviewed ${formatDay(flag.reviewedAt)}` : ""}
                        {tab === "closed" ? ` · ${STATUS_LABEL[flag.status] ?? flag.status}` : ""}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {flag.reasons.map((reason) => (
                        <StatusBadge key={reason} tone={REASON_TONE[reason] ?? "neutral"}>
                          {REASON_LABEL[reason] ?? reason}
                        </StatusBadge>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
                    <Figure label="Settled Battles" value={String(flag.battleCount)} />
                    <Figure label="Win record" value={`${flag.userAWins}–${flag.userBWins}`} hint={`@${flag.userA.handle} first`} />
                    <Figure
                      label="Net moved"
                      // The stored figure saturates at MAX_STORED_NET_KOBO
                      // (see stakePatterns.ts), so at the ceiling this reads
                      // "at least" rather than quietly understating what
                      // crossed between the two accounts.
                      value={`${Math.abs(flag.netKobo) >= MAX_STORED_NET_KOBO ? "over " : ""}${naira(Math.abs(flag.netKobo))}`}
                      hint={`@${loser.handle} → @${winner.handle}`}
                    />
                    <Figure label="Measured over" value={`${flag.windowDays} days`} />
                  </div>

                  {flag.firstBattleAt && flag.lastBattleAt && (
                    <p className="text-[12px] text-muted">
                      Settled between {formatDay(flag.firstBattleAt)} and {formatDay(flag.lastBattleAt)}.
                    </p>
                  )}

                  {flag.status === "OPEN" ? (
                    <StakePatternReview flagId={flag.id} />
                  ) : (
                    <div className="border-t border-border pt-3">
                      <p className="text-[12px] text-muted">
                        {flag.reviewedBy ? `${flag.reviewedBy.displayName} (@${flag.reviewedBy.handle})` : "A staff member"} marked this{" "}
                        {STATUS_LABEL[flag.status]?.toLowerCase() ?? flag.status.toLowerCase()}.
                      </p>
                      {flag.reviewNote && (
                        <p className="mt-1.5 border-l-2 border-border-strong pl-3 text-[13px] text-foreground">{flag.reviewNote}</p>
                      )}
                    </div>
                  )}
                </div>
              </Panel>
            );
          })}
        </div>
      )}

      {flags.length > 0 && (
        <div className="mt-4">
          <Pagination page={page} pageSize={PAGE_SIZE} total={total} href={pageHref} />
        </div>
      )}
    </>
  );
}

function Figure({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] tracking-wide text-muted uppercase">{label}</span>
      <span className="text-[14px] font-semibold tabular-nums text-foreground">{value}</span>
      {hint && <span className="text-[11px] text-muted">{hint}</span>}
    </div>
  );
}
