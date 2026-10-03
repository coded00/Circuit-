/**
 * Circuit — a player's recent results as small W / L / D chips, latest first
 * (the latest one ringed). Shared by the profile and the per-game profile.
 */

export type FormResult = "W" | "L" | "D";

/** The colours a result takes everywhere it's shown as a badge or chip. */
export const RESULT_CHIP_CLASS: Record<FormResult | "VOID", string> = {
  W: "bg-success/15 text-success",
  L: "bg-danger/15 text-danger",
  D: "bg-surface-elevated text-muted",
  VOID: "bg-surface-elevated text-muted",
};

export function FormChips({ form, size = "sm" }: { form: FormResult[]; size?: "sm" | "md" }) {
  if (form.length === 0) return null;
  const box = size === "md" ? "h-7 w-7 cut-avatar text-xs" : "h-5 w-5 rounded-none text-[10px]";
  return (
    <div className={`flex flex-wrap items-center ${size === "md" ? "gap-1.5" : "gap-1"}`} aria-label={`Last ${form.length} results, most recent first: ${form.join(" ")}`}>
      {form.map((r, i) => (
        <span key={i} aria-hidden className={`flex items-center justify-center font-mono font-bold ${box} ${RESULT_CHIP_CLASS[r]} ${i === 0 ? "ring-1 ring-current/40" : ""}`}>
          {r}
        </span>
      ))}
    </div>
  );
}
