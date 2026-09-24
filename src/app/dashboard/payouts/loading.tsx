/**
 * Circuit — loading skeleton for /dashboard/payouts, matching its own
 * 2-tile metrics row + table layout.
 */
export default function DashboardPayoutsLoading() {
  return (
    <div className="flex flex-1 flex-col gap-6">
      <div className="skeleton h-8 w-32" />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="widget flex flex-col gap-2">
            <div className="skeleton h-3 w-28" />
            <div className="skeleton h-7 w-24" />
          </div>
        ))}
      </div>

      <div className="skeleton h-48 w-full" />
    </div>
  );
}
