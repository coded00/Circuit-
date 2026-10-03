/**
 * Circuit — a personalized Discover section: title, how many are in it,
 * and a horizontally scrolling row of cards (the main grid below scrolls
 * vertically). The row bleeds to the screen edge on phones so the next
 * card peeks in as a swipe cue.
 */
export function DiscoverySectionRow({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline gap-2">
        <h2 className="font-display text-lg font-bold tracking-tight">{title}</h2>
        {count !== undefined && <span className="font-mono text-xs text-muted-strong tabular-nums">{count}</span>}
      </div>
      <div className="scrollbar-hide -mx-4 flex scroll-pl-4 snap-x gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:gap-4 sm:px-0">{children}</div>
    </section>
  );
}
