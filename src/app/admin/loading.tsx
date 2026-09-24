/**
 * Circuit — loading skeleton for the Admin Overview landing page, matching
 * its own 4-metric-card row + 2-column (activity feed / 7-day snapshot)
 * layout. V1 audit follow-up: this page runs 10 parallel queries with no
 * loading state at all before this — a click into Admin showed a blank
 * screen until every one of them resolved.
 */
export default function AdminOverviewLoading() {
  return (
    <div className="flex flex-1 flex-col gap-8">
      <div className="flex flex-col gap-1">
        <div className="skeleton h-8 w-40" />
        <div className="skeleton h-4 w-64" />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card flex items-center gap-4">
            <div className="skeleton h-11 w-11 shrink-0 rounded-full" />
            <div className="flex flex-col gap-2">
              <div className="skeleton h-3 w-20" />
              <div className="skeleton h-6 w-16" />
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.1fr_1fr]">
        <div className="card flex flex-col gap-4">
          <div className="skeleton h-5 w-32" />
          <div className="flex flex-col gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="skeleton h-5 w-full" />
            ))}
          </div>
        </div>
        <div className="card flex flex-col gap-4">
          <div className="skeleton h-5 w-36" />
          <div className="skeleton h-32 w-full" />
        </div>
      </div>
    </div>
  );
}
