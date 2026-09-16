/**
 * Circuit — Wallet. A real, spendable balance: Fund it via Paystack/
 * Flutterwave checkout, spend it directly on tournament entry fees, cash
 * it out to your linked payout method via Withdraw. `User.walletBalance`
 * is the authoritative running total; every change to it happens in the
 * same DB transaction as a `WalletTransaction` ledger row that justifies
 * it (src/lib/wallet.ts, src/app/api/wallet/fund, src/app/api/wallet/
 * withdraw) — never a number invented independently of real rows.
 *
 * Below the balance sits the broader "activity statement" — every
 * tournament entry fee/refund/prize AND every Battle stake/payout/
 * refund, merged into one real `EscrowTransaction`-backed ledger (see
 * src/lib/wallet.ts's own comment on the one asymmetry: a tournament
 * prize still pays out externally to your linked payout method, never
 * landing in this wallet, while a Battle stake payout always does).
 */

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowDownToLine, ArrowUpFromLine, ReceiptText, Settings, Trophy, Wallet as WalletIcon } from "lucide-react";
import { getCurrentUser } from "@/lib/session";
import { getWalletActivity } from "@/lib/wallet";
import { FundWalletButton } from "./FundWalletButton";

// Private, per-user financial data — never real public content.
export const metadata: Metadata = { robots: { index: false, follow: false } };
import { WithdrawButton } from "./WithdrawButton";

function formatNaira(kobo: number): string {
  return `₦ ${(kobo / 100).toLocaleString("en-NG", { minimumFractionDigits: 0 })}`;
}

function statusTone(status: string): "attention" | "complete" | "cancelled" {
  switch (status) {
    case "COMPLETE":
      return "complete";
    case "FAILED":
      return "cancelled";
    default:
      return "attention";
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case "COMPLETE":
      return "Complete";
    case "FAILED":
      return "Failed";
    default:
      return "Processing";
  }
}

function badgeClass(tone: "attention" | "complete" | "cancelled"): string {
  return `badge badge-${tone}`;
}

export default async function WalletPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/wallet");

  const { balance, fundingHistory, rows, totalPaid, totalRefunded, totalWon } = await getWalletActivity(user.id);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-6 py-8 sm:px-8 sm:py-10">
      <div className="flex flex-col gap-1">
        <h1 className="font-display flex items-center gap-2 text-2xl font-bold tracking-tight sm:text-3xl">
          <WalletIcon size={24} className="text-accent-volt" />
          Wallet
        </h1>
        <p className="text-sm text-muted">Fund your balance, spend it on entry fees, withdraw it anytime.</p>
      </div>

      <div data-surface="dark" className="card flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-0.5">
          <span className="text-eyebrow text-muted">Available balance</span>
          <span className="font-display text-4xl font-bold tracking-tight">{formatNaira(balance)}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <FundWalletButton />
          <WithdrawButton hasPayoutMethod={Boolean(user.payoutMethodRef)} />
        </div>
      </div>

      {!user.payoutMethodRef && (
        <div className="card flex items-center justify-between gap-3">
          <span className="text-metadata">Link a payout method to withdraw or claim tournament prizes.</span>
          <Link href="/account" className="btn-secondary shrink-0">
            <Settings size={14} />
            Manage
          </Link>
        </div>
      )}

      <div className="flex flex-col gap-3">
        <h2 className="text-section-heading">Wallet Activity</h2>
        {fundingHistory.length === 0 ? (
          <p className="card text-center text-muted">No funding or withdrawals yet.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Amount</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {fundingHistory.map((t) => (
                  <tr key={t.id}>
                    <td className="text-metadata whitespace-nowrap">{t.createdAt.toLocaleDateString("en-NG", { dateStyle: "medium" })}</td>
                    <td>{t.type === "FUND" ? "Fund" : "Withdrawal"}</td>
                    <td className={`font-mono tabular-nums ${t.type === "FUND" ? "text-success" : "text-foreground"}`}>
                      {t.type === "FUND" ? "+" : "−"}
                      {formatNaira(t.amount)}
                    </td>
                    <td>
                      <span className={badgeClass(statusTone(t.status))}>{statusLabel(t.status)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="widget flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] bg-surface-elevated text-danger">
            <ArrowUpFromLine size={18} />
          </span>
          <div className="flex flex-col">
            <span className="text-eyebrow">Fees &amp; stakes paid</span>
            <span className="text-stat text-xl">{formatNaira(totalPaid)}</span>
          </div>
        </div>
        <div className="widget flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] bg-surface-elevated text-accent-blue">
            <ArrowDownToLine size={18} />
          </span>
          <div className="flex flex-col">
            <span className="text-eyebrow">Refunded</span>
            <span className="text-stat text-xl">{formatNaira(totalRefunded)}</span>
          </div>
        </div>
        <div className="widget flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] bg-gold/15 text-gold">
            <Trophy size={18} />
          </span>
          <div className="flex flex-col">
            <span className="text-eyebrow">Winnings</span>
            <span className="text-stat text-xl text-gold">{formatNaira(totalWon)}</span>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-section-heading flex items-center gap-2">
          <ReceiptText size={17} className="text-muted" />
          Transaction History
        </h2>
        {rows.length === 0 ? (
          <p className="card text-center text-muted">
            Nothing here yet — entry fees, Battle stakes, refunds, and payouts will show up once you compete.
          </p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Context</th>
                  <th>Type</th>
                  <th>Amount</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const isCredit = row.type === "REFUND" || row.type === "PRIZE_PAYOUT" || row.type === "STAKE_PAYOUT";
                  const label =
                    row.type === "ENTRY_FEE"
                      ? "Entry fee"
                      : row.type === "REFUND"
                        ? "Refund"
                        : row.type === "PRIZE_PAYOUT"
                          ? "Prize payout"
                          : row.type === "STAKE"
                            ? "Stake"
                            : "Stake payout";
                  return (
                    <tr key={row.id}>
                      <td className="text-metadata whitespace-nowrap">
                        {row.createdAt.toLocaleDateString("en-NG", { dateStyle: "medium" })}
                      </td>
                      <td>
                        <span className="font-medium">{row.contextName}</span>{" "}
                        <span className="text-muted">· {row.contextGame}</span>
                      </td>
                      <td>{label}</td>
                      <td className={`font-mono tabular-nums ${isCredit ? "text-success" : "text-foreground"}`}>
                        {isCredit ? "+" : "−"}
                        {formatNaira(row.amount)}
                      </td>
                      <td>
                        <span className={badgeClass(statusTone(row.status))}>{statusLabel(row.status)}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
