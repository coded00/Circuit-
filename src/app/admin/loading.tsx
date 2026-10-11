/** Circuit — admin loading state: the shape of a typical admin page (header, stat strip, table). */
export default function AdminLoading() {
  return (
    <div className="flex flex-col gap-8" aria-busy="true" aria-label="Loading">
      <div className="flex flex-col gap-2">
        <div className="skeleton h-6 w-40" />
        <div className="skeleton h-4 w-72" />
      </div>
      <div className="grid grid-cols-2 overflow-hidden rounded-[10px] border border-border sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-2 border-border px-4 py-3.5 [&:not(:first-child)]:border-l">
            <div className="skeleton h-3 w-20" />
            <div className="skeleton h-6 w-16" />
          </div>
        ))}
      </div>
      <div className="flex flex-col overflow-hidden rounded-[10px] border border-border">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 border-b border-border px-4 py-3 last:border-b-0">
            <div className="skeleton h-7 w-7 shrink-0 rounded-full" />
            <div className="skeleton h-4 flex-1" />
            <div className="skeleton h-4 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}
