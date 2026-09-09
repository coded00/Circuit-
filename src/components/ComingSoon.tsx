/**
 * Circuit — shared "not built yet" placeholder. Used for Wallet/
 * Marketplace/Rewards and, per the Phase 1 Nexus mapping, the streaming
 * surface (Watch/Go Live/Stream Status) — none of these have a real
 * feature behind them, so each lands here instead of guessed-at
 * functionality.
 */

export function ComingSoon({
  title,
  description,
  icon,
}: {
  title: string;
  description: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="state-block">
      {icon && <div className="state-icon">{icon}</div>}
      <h1 className="state-title">{title}</h1>
      <p className="state-description">{description}</p>
      <span className="badge badge-neutral">Coming soon</span>
    </div>
  );
}
