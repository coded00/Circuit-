/**
 * Circuit — the instant frame shown while any page loads: the shell stays put
 * and this stands in for the page, so a tap on a link answers right away
 * instead of the screen sitting still until the server responds.
 */
export default function Loading() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 sm:px-8 sm:py-10" aria-busy="true" aria-label="Loading">
      <div className="flex flex-col gap-2">
        <div className="skeleton h-3 w-24" />
        <div className="skeleton h-9 w-64 max-w-full" />
        <div className="skeleton h-4 w-80 max-w-full" />
      </div>
      <div className="skeleton h-11 w-full" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="skeleton h-64 w-full" />
        ))}
      </div>
      <div className="skeleton h-40 w-full" />
    </div>
  );
}
