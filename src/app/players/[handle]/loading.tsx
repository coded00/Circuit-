/**
 * Circuit — loading skeleton for the public player profile, the most-
 * linked page in the app (13 sequential/parallel queries, no prior
 * loading state — V1 audit follow-up).
 */
export default function PlayerProfileLoading() {
  return (
    <div className="flex flex-1 flex-col gap-6">
      <div className="card flex items-center gap-4">
        <div className="skeleton h-20 w-20 shrink-0 rounded-full" />
        <div className="flex flex-1 flex-col gap-2">
          <div className="skeleton h-6 w-40" />
          <div className="skeleton h-4 w-28" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="widget flex flex-col gap-2">
            <div className="skeleton h-3 w-16" />
            <div className="skeleton h-6 w-12" />
          </div>
        ))}
      </div>

      <div className="skeleton h-9 w-72" />
      <div className="skeleton h-48 w-full" />
    </div>
  );
}
