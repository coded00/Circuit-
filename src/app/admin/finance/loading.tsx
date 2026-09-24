/**
 * Circuit — loading skeleton for /admin/finance, matching its own
 * metrics-grid + tabs + table layout so the page doesn't flash blank
 * while its several aggregate queries run.
 */
export default function AdminFinanceLoading() {
  return (
    <div className="flex flex-1 flex-col gap-6">
      <div className="flex flex-col gap-1">
        <div className="skeleton h-8 w-32" />
        <div className="skeleton h-4 w-56" />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="widget flex flex-col gap-2">
            <div className="skeleton h-3 w-24" />
            <div className="skeleton h-7 w-20" />
          </div>
        ))}
      </div>

      <div className="skeleton h-9 w-64" />
      <div className="skeleton h-64 w-full" />
    </div>
  );
}
