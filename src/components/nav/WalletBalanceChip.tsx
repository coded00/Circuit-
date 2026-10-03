import Link from "next/link";
import { Plus, Wallet } from "lucide-react";

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
      className="group flex h-9 shrink-0 items-center gap-2 rounded-none pr-2 pl-1.5 text-white transition hover:bg-white/[0.07]"
    >
      <Wallet size={16} className="text-accent-volt" />
      <span className="font-display text-[15px] leading-none font-bold tabular-nums">₦{naira}</span>
      <span aria-hidden className="flex h-5 w-5 items-center justify-center cut-avatar bg-accent-volt text-accent-volt-foreground transition group-hover:brightness-95">
        <Plus size={12} strokeWidth={3} />
      </span>
    </Link>
  );
}
