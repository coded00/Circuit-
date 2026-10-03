/**
 * Circuit — loading skeleton for /calendar, shaped like the real page
 * (month header, filter chips, grid + day rail) so the swap-in doesn't jump.
 */
export default function CalendarLoading() {
  return (
    <div className="flex w-full flex-1 flex-col gap-5 px-4 py-5 sm:gap-6 sm:p-8">
      <div className="flex flex-col gap-2">
        <div className="skeleton h-3 w-20" />
        <div className="skeleton h-9 w-64 sm:h-11" />
        <div className="skeleton h-3 w-72" />
      </div>
      <div className="flex gap-2">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="skeleton h-9 w-28 shrink-0" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="skeleton h-[420px] w-full sm:h-[640px]" />
        <div className="skeleton h-64 w-full" />
      </div>
    </div>
  );
}
