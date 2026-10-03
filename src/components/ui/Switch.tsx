/**
 * Circuit — an on/off switch. Used by admin catalog forms and the privacy
 * settings. Saves nothing itself; the caller decides what a change means.
 */

export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center cut-xs transition-colors disabled:opacity-50 ${
        checked ? "bg-accent-volt" : "bg-border-strong"
      }`}
    >
      <span
        className={`inline-block h-4 w-4 cut-avatar transition-transform ${
          checked ? "translate-x-[18px] bg-accent-volt-foreground" : "translate-x-0.5 bg-surface"
        }`}
      />
    </button>
  );
}
