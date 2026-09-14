/**
 * Circuit — placeholder for admin sections not built yet (everything
 * past Overview, per the build order: sidebar/top bar/Overview first,
 * "then use that design system consistently across the remaining admin
 * pages"). Real routes so sidebar links never 404 — just not real
 * functionality yet.
 */
export function AdminComingSoon({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-1 flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-bold tracking-tight">{title}</h1>
        <p className="text-sm text-muted">{description}</p>
      </div>
      <div className="card flex flex-1 flex-col items-center justify-center gap-2 py-24 text-center">
        <span className="text-eyebrow text-muted-strong">Coming soon</span>
        <p className="max-w-sm text-sm text-muted">This section isn&apos;t built yet — Overview came first.</p>
      </div>
    </div>
  );
}
