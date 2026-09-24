/**
 * Circuit — loading skeleton for the admin tournament detail/manage page
 * (6 queries, no prior loading state — V1 audit follow-up).
 */
export default function AdminCompetitionDetailLoading() {
  return (
    <div className="flex flex-1 flex-col gap-6">
      <div className="skeleton h-4 w-28" />

      <div className="card flex flex-col gap-3">
        <div className="skeleton h-5 w-24" />
        <div className="skeleton h-7 w-64" />
        <div className="skeleton h-4 w-32" />
      </div>

      <div className="card flex flex-col gap-2">
        <div className="skeleton h-4 w-24" />
        <div className="skeleton h-9 w-full" />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="widget flex flex-col gap-2">
            <div className="skeleton h-3 w-20" />
            <div className="skeleton h-6 w-16" />
          </div>
        ))}
      </div>

      <div className="skeleton h-24 w-full" />
      <div className="skeleton h-48 w-full" />
    </div>
  );
}
