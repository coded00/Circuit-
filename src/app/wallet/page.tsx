import { PlusCircle, Trophy, Gift, ArrowDownToLine, ArrowRight } from "lucide-react";

/**
 * Circuit — Wallet placeholder. No balance ledger, deposit, or withdrawal
 * capability exists yet (see the MVP rework plan — a real Wallet is its
 * own future pass). Per explicit product decision this gets a bespoke,
 * intentional placeholder rather than the generic `ComingSoon` treatment
 * — a preview of the real financial loop the Wallet will eventually
 * power, not fake balances or working-looking controls.
 */

const FLOW_STEPS = [
  { icon: PlusCircle, label: "Add Funds" },
  { icon: Trophy, label: "Compete" },
  { icon: Gift, label: "Win Rewards" },
  { icon: ArrowDownToLine, label: "Withdraw" },
] as const;

export default function WalletPage() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center gap-8 px-6 py-20 text-center">
      <div className="flex flex-col items-center gap-3">
        <span className="text-eyebrow">Circuit Wallet</span>
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
          Your competitive economy, <span className="text-accent-volt">coming soon</span>.
        </h1>
        <p className="max-w-md text-sm text-muted">
          Manage competition entries, rewards and winnings directly within Circuit.
        </p>
      </div>

      <div className="card flex w-full flex-wrap items-center justify-center gap-2 py-6">
        {FLOW_STEPS.map((step, i) => (
          <div key={step.label} className="flex items-center gap-2">
            <div className="flex flex-col items-center gap-2">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-accent-blue-soft text-accent-blue">
                <step.icon size={18} />
              </div>
              <span className="text-xs font-medium text-muted">{step.label}</span>
            </div>
            {i < FLOW_STEPS.length - 1 && <ArrowRight size={16} className="mb-5 text-muted-strong" />}
          </div>
        ))}
      </div>

      <span className="badge badge-neutral">Coming soon</span>
    </div>
  );
}
