/**
 * Circuit — auth page headline: a small volt eyebrow, a big display
 * title, one line of context. Left-aligned, like the rest of the panel.
 */
export function AuthHeading({ eyebrow, title, sub }: { eyebrow: string; title: string; sub?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2.5">
      <span className="flex items-center gap-2 font-mono text-[11px] font-semibold tracking-[0.18em] text-accent-volt uppercase">
        <span className="h-px w-6 bg-accent-volt" aria-hidden />
        {eyebrow}
      </span>
      <h1 className="font-display text-[34px] leading-[0.95] font-bold tracking-tight uppercase sm:text-[42px]">{title}</h1>
      {sub && <p className="text-[15px] leading-relaxed text-muted">{sub}</p>}
    </div>
  );
}
