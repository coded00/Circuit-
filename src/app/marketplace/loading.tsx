/** Shown while the Marketplace loads: the hero, the category doors and a row of cards, in their real footprint. */
export default function MarketplaceLoading() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-4 py-6 sm:px-8 sm:py-10" aria-busy="true" aria-label="Loading">
      <div className="flex flex-col gap-2">
        <div className="skeleton h-9 w-56" />
        <div className="skeleton h-4 w-72" />
      </div>
      <div className="skeleton h-11 w-full" />
      <div className="skeleton h-[22rem] w-full rounded-[var(--radius-lg)]" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton h-28 w-full rounded-[var(--radius-lg)]" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton h-64 w-full rounded-[var(--radius-lg)]" />
        ))}
      </div>
    </div>
  );
}
