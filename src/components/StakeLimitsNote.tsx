/**
 * Circuit — what a player has staked, against the limits they are held to.
 *
 * Shown on the challenge form (once "Staked" is picked) and on the Responsible
 * play tab. Deliberately no "use client": the challenge form is a client
 * component and the account page is a server one, and this is the same markup
 * either way.
 *
 * Phrased as usage and never as headroom. It says what has been staked; it
 * never says how much more could be. This is the surface in the app closest to
 * gambling (docs/circuit-strategy.md §10), and "you can still stake ₦80,000
 * today" is an invitation that costs nothing to leave out — a player who wants
 * that subtraction can do it, and one who doesn't is not prompted to.
 *
 * The four numbers come from `stakeBudget` (src/lib/stakes.ts), which is the
 * same query `lockStake` enforces against, so this cannot drift from the
 * figure a stake is actually refused for.
 */

function naira(kobo: number): string {
  return `₦${(kobo / 100).toLocaleString("en-NG")}`;
}

export function StakeLimitsNote({
  lockedTotal,
  maxLocked,
  dailyTotal,
  maxDaily,
}: {
  /** At risk right now — open and accepted Battles, and challenges nobody has taken yet. */
  lockedTotal: number;
  maxLocked: number;
  /** Everything staked in the last 24 hours, cancelled and refunded stakes included. */
  dailyTotal: number;
  maxDaily: number;
}) {
  return (
    <div className="flex flex-col gap-2 cut-sm [--cut-line:var(--border)] border border-border bg-surface-elevated p-3">
      <dl className="flex flex-col gap-1.5 text-[13px]">
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-muted">In play now</dt>
          <dd className="text-right">
            <span className="text-stat">{naira(lockedTotal)}</span>
            <span className="text-muted"> of your {naira(maxLocked)} limit</span>
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-muted">Last 24 hours</dt>
          <dd className="text-right">
            <span className="text-stat">{naira(dailyTotal)}</span>
            <span className="text-muted"> of your {naira(maxDaily)} limit</span>
          </dd>
        </div>
      </dl>
      {/* The 24-hour figure is the one that surprises people: a stake they opened and cancelled an hour
          later is still in it, because a limit that refunds a cancelled stake is a limit a pair can
          move any amount through by opening and cancelling in a loop. Saying so here is cheaper than
          the refusal message explaining it later. */}
      <p className="text-[11px] text-muted">
        The 24-hour figure counts every stake you&apos;ve opened, including ones you cancelled or that were
        refunded.
      </p>
    </div>
  );
}
