/**
 * Circuit — Admin Payouts: completed tournaments waiting for staff to approve their payout, with what was
 * actually collected, who would be paid what out of it, and anything that should hold the release back.
 * Nothing is paid out (prizes or the organizer's share) until a tournament is approved here.
 */

import Link from "next/link";
import { prisma } from "@/lib/db";
import { EmptyState, KeyValue, PageHeader, Panel, StatusBadge, SubNav, naira } from "@/components/admin/ui";
import { PayoutApprovalControl } from "@/components/admin/PayoutApprovalControl";
import { reviewTournamentPayout } from "@/lib/payoutReview";

const TABS = ["waiting", "approved"] as const;

export default async function AdminPayoutsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab: tabParam } = await searchParams;
  const tab = TABS.find((t) => t === tabParam) ?? "waiting";
  const hasMoney = { OR: [{ entryFee: { gt: 0 } }, { prizeAmount: { gt: 0 } }] };
  const [waitingCount, approvedCount, tournaments] = await Promise.all([
    prisma.tournament.count({ where: { status: "COMPLETE", payoutApprovedAt: null, ...hasMoney } }),
    prisma.tournament.count({ where: { payoutApprovedAt: { not: null } } }),
    prisma.tournament.findMany({
      where: tab === "waiting" ? { status: "COMPLETE", payoutApprovedAt: null, ...hasMoney } : { payoutApprovedAt: { not: null } },
      orderBy: tab === "waiting" ? { completedAt: "asc" } : { payoutApprovedAt: "desc" },
      take: 25,
      include: { organizer: { select: { user: { select: { displayName: true, handle: true } } } } },
    }),
  ]);
  const reviews = await Promise.all(tournaments.map((t) => reviewTournamentPayout(t)));

  return (
    <>
      <PageHeader title="Payouts" description="Completed tournaments waiting for approval. Nothing is paid out, to winners or to the organizer, until a tournament is approved here." />
      <SubNav
        active={tab}
        items={[
          { key: "waiting", label: "Waiting for approval", href: "/admin/payouts", count: waitingCount },
          { key: "approved", label: "Approved", href: "/admin/payouts?tab=approved", count: approvedCount },
        ]}
      />

      {tournaments.length === 0 ? (
        <EmptyState title={tab === "waiting" ? "Nothing waiting" : "No approved payouts yet"} description={tab === "waiting" ? "Completed tournaments with entry fees or a cash prize appear here." : undefined} />
      ) : (
        <div className="flex flex-col gap-4">
          {tournaments.map((t, i) => {
            const r = reviews[i];
            return (
              <Panel key={t.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link href={`/admin/competitions/${t.id}`} className="text-sm font-semibold hover:underline">
                      {t.name}
                    </Link>
                    <p className="text-xs text-muted">
                      {t.organizer.user.displayName} (@{t.organizer.user.handle})
                      {t.completedAt ? ` · finished ${t.completedAt.toLocaleDateString("en-NG")}` : ""}
                      {t.payoutApprovedAt ? ` · ${t.payoutApprovedById ? "approved" : "approved automatically"} ${t.payoutApprovedAt.toLocaleDateString("en-NG")}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {t.fundsFrozen && <StatusBadge tone="danger">Frozen</StatusBadge>}
                    {/* "Ready" would be misleading for these: nothing is wrong with them, but the money
                        isn't the tournament's own, so a person has to decide (never the sweep) — see
                        unbackedAmount in src/lib/payoutReview.ts. */}
                    {r.unbackedAmount > 0 && <StatusBadge tone="attention">Platform-funded</StatusBadge>}
                    {r.blockers.length === 0 && r.unbackedAmount === 0 && !t.payoutApprovedAt && <StatusBadge tone="success">Ready</StatusBadge>}
                    {r.blockers.length > 0 && <StatusBadge tone="attention">{r.blockers.length} to resolve</StatusBadge>}
                  </div>
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <KeyValue
                    items={[
                      { label: "Entry fees collected", value: naira(r.entryFeesCollected) },
                      { label: "Platform fee", value: naira(r.platformFees) },
                      { label: "Left after the fee", value: naira(r.collectedForPrizes) },
                      { label: "Refunded entries", value: r.refundedEntries.toLocaleString("en-NG") },
                      { label: "Prize promised", value: naira(r.declaredPrize) },
                      { label: "Prize payable", value: naira(r.payablePrize) },
                      { label: "Organizer's share", value: naira(r.organizerShare) },
                      // Only ever non-zero for a staff-run (sponsored) tournament. Shown because it is the
                      // one number here that isn't the players' money — approving it spends Circuit's own.
                      ...(r.unbackedAmount > 0 ? [{ label: "From Circuit's balance", value: naira(r.unbackedAmount) }] : []),
                    ]}
                  />
                  <div>
                    <p className="mb-1 text-xs font-medium text-muted">Winners</p>
                    {r.shares.length === 0 ? (
                      <p className="text-sm text-muted">No cash prize.</p>
                    ) : (
                      <ul className="flex flex-col gap-1 text-sm">
                        {r.shares.map((s) => (
                          <li key={`${s.userId}-${s.place}`} className="flex justify-between gap-3">
                            <span>
                              {s.place}. {s.name}
                            </span>
                            <span>
                              {naira(s.payable)}
                              {s.payable < s.declared ? <span className="text-muted"> of {naira(s.declared)}</span> : null}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>

                {r.unbackedAmount > 0 && (
                  <p className="mt-3 text-xs text-muted">
                    {naira(r.unbackedAmount)} of this is more than the tournament&apos;s entry fees collected, so it comes out of
                    Circuit&apos;s own balance. It can only be approved by a staff member who is neither the organizer nor in a
                    prize place here, and never automatically.
                  </p>
                )}
                {r.blockers.length > 0 && (
                  <ul className="mt-3 list-disc pl-5 text-xs text-muted">
                    {r.blockers.map((b) => (
                      <li key={b}>{b}</li>
                    ))}
                  </ul>
                )}
                {t.payoutApprovalNote && <p className="mt-3 text-xs text-muted">Note: {t.payoutApprovalNote}</p>}

                <div className="mt-4">
                  <PayoutApprovalControl tournamentId={t.id} approved={!!t.payoutApprovedAt} blocked={r.blockers.length > 0} canWithdraw />
                </div>
              </Panel>
            );
          })}
        </div>
      )}
    </>
  );
}
