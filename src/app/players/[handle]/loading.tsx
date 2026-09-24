/**
 * Circuit — loading skeleton for the player profile. Mirrors the real
 * layout (identity header + stat strip, tab bar, Overview's two columns)
 * so the page doesn't jump when data arrives.
 */
export default function PlayerProfileLoading() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 sm:px-8 sm:py-8">
      <div className="overflow-hidden rounded-[var(--radius-hero)] border border-border">
        <div className="flex items-center gap-5 p-5 sm:p-7">
          <div className="skeleton h-20 w-20 shrink-0 rounded-full sm:h-24 sm:w-24" />
          <div className="flex flex-1 flex-col gap-2">
            <div className="skeleton h-8 w-48" />
            <div className="skeleton h-4 w-64 max-w-full" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-px border-t border-border bg-border sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex flex-col gap-2 bg-surface px-5 py-4 sm:px-7">
              <div className="skeleton h-3 w-16" />
              <div className="skeleton h-6 w-14" />
            </div>
          ))}
        </div>
      </div>

      <div className="skeleton h-10 w-full max-w-md" />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="skeleton h-80 w-full rounded-[15px]" />
        <div className="skeleton h-80 w-full rounded-[15px]" />
      </div>
    </div>
  );
}
