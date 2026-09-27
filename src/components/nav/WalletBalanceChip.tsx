import Link from "next/link";
import { Wallet } from "lucide-react";

/**
 * Circuit — header wallet balance chip. Shows the real, spendable
 * `User.walletBalance` (kobo) — funded via Fund Wallet, spent on entry
 * fees, cashed out via Withdraw (src/lib/wallet.ts, src/app/api/wallet/).
 * Shown on every screen size — on phones it's the way into the wallet
 * (the bottom tab bar's slot went to Community).
 */
export function WalletBalanceChip({ balance }: { balance: number }) {
  const naira = Math.round(balance / 100).toLocaleString("en-NG");

  return (
    <Link
      href="/wallet"
      aria-label={`Wallet: ₦${naira}`}
      className="group flex h-9 shrink-0 items-center gap-2 rounded-[10px] border border-border bg-surface py-1 pr-2.5 pl-1 text-foreground transition hover:border-border-hover"
    >
      <span className="flex h-7 w-7 items-center justify-center rounded-[7px] bg-[#111318] text-accent-volt dark:bg-accent-volt-soft">
        <Wallet size={14} />
      </span>
      <span className="font-display text-[15px] leading-none font-bold tabular-nums">₦{naira}</span>
    </Link>
  );
}
