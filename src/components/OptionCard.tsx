/**
 * Circuit — selectable option card (docs/circuit-ui-references.md:
 * Challonge's format-picker grid — a name plus a one-line description,
 * not a raw radio/dropdown). Used for Battle format/visibility, match
 * winner selection, and dispute rulings.
 */

export function OptionCard({
  selected,
  onSelect,
  title,
  description,
}: {
  selected: boolean;
  onSelect: () => void;
  title: string;
  description?: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex flex-col gap-0.5 rounded-lg border p-3 text-left transition ${
        selected ? "border-brand bg-brand-soft" : "border-border bg-surface hover:border-border-strong"
      }`}
    >
      <span className="text-sm font-medium">{title}</span>
      {description && <span className="text-xs text-muted">{description}</span>}
    </button>
  );
}
