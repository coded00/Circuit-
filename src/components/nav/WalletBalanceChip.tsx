import Link from "next/link";
import { Wallet } from "lucide-react";

/**
 * Circuit — header wallet balance chip. Shows the real, spendable
 * `User.walletBalance` (kobo) — funded via Fund Wallet, spent on entry
 * fees, cashed out via Withdraw (src/lib/wallet.ts, src/app/api/wallet/).
 */
export function WalletBalanceChip({ balance }: { balance: number }) {
  const naira = Math.round(balance / 100).toLocaleString("en-NG");

  return (
    <Link
      href="/wallet"
      className="hidden shrink-0 items-center gap-1.5 rounded-full border border-border-strong bg-surface-elevated px-3 py-1.5 text-sm font-semibold text-foreground transition hover:border-border-hover sm:flex"
    >
      <Wallet size={14} className="text-accent-volt" />
      <span className="font-mono tabular-nums">₦{naira}</span>
    </Link>
  );
}
