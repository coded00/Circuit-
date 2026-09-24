/**
 * Circuit — loading skeleton for /leaderboard (6 queries, no prior
 * loading state — V1 audit follow-up).
 */
export default function LeaderboardLoading() {
  return (
    <div className="flex flex-1 flex-col gap-6">
      <div className="flex flex-col gap-1">
        <div className="skeleton h-8 w-40" />
        <div className="skeleton h-4 w-56" />
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="widget flex flex-col gap-2">
            <div className="skeleton h-3 w-20" />
            <div className="skeleton h-6 w-14" />
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="skeleton h-12 w-full" />
        ))}
      </div>
    </div>
  );
}
