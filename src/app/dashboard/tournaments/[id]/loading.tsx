/**
 * Circuit — loading skeleton for an organizer's own tournament detail
 * panel (5 queries, no prior loading state — V1 audit follow-up).
 */
export default function DashboardTournamentDetailLoading() {
  return (
    <div className="flex flex-1 flex-col gap-8">
      <div className="flex flex-col gap-2">
        <div className="skeleton h-5 w-24" />
        <div className="skeleton h-7 w-64" />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="widget flex flex-col gap-2">
            <div className="skeleton h-3 w-24" />
            <div className="skeleton h-6 w-16" />
          </div>
        ))}
      </div>

      <div className="skeleton h-24 w-full" />
      <div className="skeleton h-48 w-full" />
    </div>
  );
}
