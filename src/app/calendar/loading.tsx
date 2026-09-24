/**
 * Circuit — loading skeleton for /calendar (4 queries, no prior loading
 * state — V1 audit follow-up).
 */
export default function CalendarLoading() {
  return (
    <div className="flex flex-1 flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <div className="skeleton h-8 w-40" />
        <div className="skeleton h-9 w-48" />
      </div>
      <div className="skeleton h-96 w-full" />
    </div>
  );
}
