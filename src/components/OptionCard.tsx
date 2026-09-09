/**
 * Circuit — selectable option card. Used for Battle format/visibility,
 * match winner selection, and dispute rulings.
 */

export function OptionCard({
  selected,
  onSelect,
  title,
  description,
  disabled,
  disabledTitle,
}: {
  selected: boolean;
  onSelect: () => void;
  title: string;
  description?: string;
  /** Visible but non-interactive — same "coming soon" pattern as Go Live/
   *  Circuit+ elsewhere in this app, for options that exist in the UI
   *  ahead of the backend capability they'd need. */
  disabled?: boolean;
  disabledTitle?: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      title={disabled ? disabledTitle : undefined}
      aria-pressed={selected}
      className={`flex w-full flex-col items-start gap-1 rounded-[10px] border px-4 py-3 text-left text-sm transition disabled:cursor-not-allowed disabled:opacity-50 ${
        selected
          ? "border-accent-blue bg-accent-blue-soft text-foreground"
          : "border-border bg-surface-elevated text-muted hover:border-border-hover hover:text-foreground"
      }`}
    >
      <span className="font-medium">{title}</span>
      {description && <span className="text-xs text-muted">{description}</span>}
    </button>
  );
}
