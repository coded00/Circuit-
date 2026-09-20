/**
 * Circuit — loading skeleton for the admin user detail page (5 queries,
 * no prior loading state — V1 audit follow-up).
 */
export default function AdminUserDetailLoading() {
  return (
    <div className="flex flex-1 flex-col gap-6">
      <div className="card flex items-center justify-between gap-4">
        <div className="flex flex-col gap-2">
          <div className="skeleton h-6 w-40" />
          <div className="skeleton h-4 w-28" />
        </div>
        <div className="skeleton h-9 w-24" />
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="widget flex flex-col gap-2">
            <div className="skeleton h-3 w-16" />
            <div className="skeleton h-6 w-10" />
          </div>
        ))}
      </div>

      <div className="skeleton h-40 w-full" />
      <div className="skeleton h-40 w-full" />
    </div>
  );
}
