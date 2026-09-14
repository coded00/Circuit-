import { Sparkles } from "lucide-react";

/**
 * Circuit — "Circuit+" premium upsell card (Phase 12 of the CIRCUIT UI
 * spec). Circuit has no subscription/premium tier of any kind. Per the
 * Phase 1 decision this stays visible with the spec's premium visual
 * treatment, but the CTA is genuinely disabled — same pattern as Go Live
 * elsewhere — rather than a working upsell that leads nowhere real.
 * A flat surface with a gold accent border, not a layered glow-blob
 * background — kept consistent with the calmer treatment applied to
 * SidebarPromoCard. Gold, not the retired brand-violet token: same
 * "premium/championship" semantic gold already carries everywhere else
 * (prize pools, featured content).
 */
export function CircuitPlus() {
  return (
    <div className="flex flex-col gap-3 rounded-[15px] border border-gold/30 bg-surface-elevated p-5">
      <div
        className="flex h-10 w-10 items-center justify-center rounded-full"
        style={{ background: "var(--gold)" }}
      >
        <Sparkles size={18} className="text-white" />
      </div>

      <span className="font-display text-xl font-bold">Circuit+</span>

      <p className="text-sm text-muted">Unlock advanced stats, exclusive rewards and more.</p>

      <button type="button" disabled title="Circuit+ — coming soon" className="btn-secondary w-full border-gold/50">
        Upgrade Now
      </button>
    </div>
  );
}
