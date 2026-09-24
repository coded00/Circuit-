/**
 * Circuit — Wallet. A real, spendable balance: Fund it via Paystack/
 * Flutterwave checkout, spend it directly on tournament entry fees, cash
 * it out to your linked payout method via Withdraw. `User.walletBalance`
 * is the authoritative running total; every change to it happens in the
 * same DB transaction as a `WalletTransaction` ledger row that justifies
 * it (src/lib/wallet.ts, src/app/api/wallet/fund, src/app/api/wallet/
 * withdraw) — never a number invented independently of real rows.
 *
 * Top-ups/withdrawals and competition money (entry fees, stakes, payouts,
 * refunds — `EscrowTransaction`-backed) are merged into one statement.
 * One asymmetry is kept visible in the copy: a tournament prize pays out
 * externally to your linked payout method, never landing in this wallet,
 * while a Battle stake payout always does (see src/lib/wallet.ts).
 */

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Landmark } from "lucide-react";
import { getCurrentUser } from "@/lib/session";
import { getWalletActivity } from "@/lib/wallet";
import { StatStrip } from "@/components/ui/StatStrip";
import { FundWalletButton } from "./FundWalletButton";
import { WithdrawButton } from "./WithdrawButton";
import { WalletActivityList, type WalletEntry } from "./WalletActivityList";

// Private, per-user financial data — never real public content.
export const metadata: Metadata = { robots: { index: false, follow: false } };

function formatNaira(kobo: number): string {
  return `₦${(kobo / 100).toLocaleString("en-NG", { minimumFractionDigits: 0 })}`;
}

function normalizeStatus(status: string): WalletEntry["status"] {
  return status === "COMPLETE" ? "COMPLETE" : status === "FAILED" ? "FAILED" : "PENDING";
}

const COMPETITION_TITLE: Record<string, string> = {
  ENTRY_FEE: "Entry fee",
  REFUND: "Refund",
  PRIZE_PAYOUT: "Prize payout",
  STAKE: "Stake locked",
  STAKE_PAYOUT: "Challenge winnings",
};

export default async function WalletPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/wallet");

  const { balance, fundingHistory, rows, totalPaid, totalRefunded, totalWon } = await getWalletActivity(user.id);

  const entries: WalletEntry[] = [
    ...fundingHistory.map(
      (t): WalletEntry => ({
        id: `w-${t.id}`,
        at: t.createdAt.toISOString(),
        kind: t.type,
        title: t.type === "FUND" ? "Wallet top-up" : "Withdrawal",
        subtitle: t.type === "FUND" ? "Card or bank transfer" : "To your payout account",
        amount: t.amount,
        credit: t.type === "FUND",
        status: normalizeStatus(t.status),
      })
    ),
    ...rows.map(
      (r): WalletEntry => ({
        id: `e-${r.id}`,
        at: r.createdAt.toISOString(),
        kind: r.type,
        title: COMPETITION_TITLE[r.type] ?? r.type,
        subtitle:
          r.type === "PRIZE_PAYOUT"
            ? `${r.contextName} · paid to your payout account`
            : [r.contextName, r.contextGame].filter(Boolean).join(" · "),
        amount: r.amount,
        credit: r.type === "REFUND" || r.type === "PRIZE_PAYOUT" || r.type === "STAKE_PAYOUT",
        status: normalizeStatus(r.status),
      })
    ),
  ].sort((a, b) => b.at.localeCompare(a.at));

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 py-6 sm:px-8 sm:py-10">
      <section data-surface="dark" className="overflow-hidden rounded-[var(--radius-hero)] border border-border">
        <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-end sm:justify-between sm:p-7">
          <div className="flex flex-col gap-2">
            <span className="text-eyebrow text-muted">Wallet balance</span>
            <span className="text-stat text-4xl leading-none sm:text-5xl">{formatNaira(balance)}</span>
            <span className="text-xs text-muted">Spend it on entry fees and stakes, or withdraw anytime.</span>
          </div>
          <div className="flex flex-wrap items-start gap-2">
            <FundWalletButton />
            <WithdrawButton hasPayoutMethod={Boolean(user.payoutMethodRef)} />
          </div>
        </div>
        <StatStrip
          columns="grid-cols-3"
          compact
          stats={[
            { label: "Winnings", value: formatNaira(totalWon), valueClassName: "text-gold" },
            { label: "Fees & stakes", value: formatNaira(totalPaid) },
            { label: "Refunded", value: formatNaira(totalRefunded) },
          ]}
        />
      </section>

      {!user.payoutMethodRef && (
        <div className="flex items-center gap-3 rounded-[var(--radius-lg)] border border-dashed border-border-strong px-4 py-3">
          <Landmark size={18} className="shrink-0 text-muted" />
          <p className="min-w-0 flex-1 text-sm text-muted">Add a payout account to withdraw and receive tournament prizes.</p>
          <Link href="/account" className="shrink-0 text-sm font-medium text-accent-blue hover:underline">
            Add account
          </Link>
        </div>
      )}

      <WalletActivityList entries={entries} />
    </div>
  );
}
