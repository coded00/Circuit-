/**
 * Circuit — shared "not built yet" placeholder. Used for Wallet/
 * Marketplace/Rewards: sidebar links exist (matching the NEXA reference's
 * IA) but no product spec exists for any of the three yet, so each lands
 * here instead of guessed-at real functionality.
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
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 px-6 py-24 text-center">
      {icon && (
        <div className="flex h-14 w-14 items-center justify-center rounded-full border border-border bg-surface text-muted">
          {icon}
        </div>
      )}
      <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
      <p className="text-sm text-muted">{description}</p>
      <span className="w-fit rounded-full bg-status-neutral/15 px-2.5 py-1 text-xs font-medium text-status-neutral">
        Coming soon
      </span>
    </div>
  );
}
