/**
 * Circuit — shell for the Terms and Privacy pages. The text on both is a
 * DRAFT written from what the app actually does; it has not had legal
 * review and must be replaced or approved before launch.
 */

export function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <article className="mx-auto flex w-full max-w-[720px] flex-col gap-6 px-5 py-10 sm:px-8">
      <div role="note" className="rounded-[var(--radius-control)] border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
        <strong className="font-semibold">Draft. Not yet legally reviewed.</strong> This page describes how Circuit works today and will be replaced by final text before launch.
      </div>
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-4xl leading-none font-bold tracking-tight uppercase">{title}</h1>
        <p className="font-mono text-xs text-muted-strong">Draft last updated {updated}</p>
      </header>
      <div className="flex flex-col gap-5 text-[15px] leading-relaxed text-foreground/90 [&_h2]:mt-2 [&_h2]:font-display [&_h2]:text-xl [&_h2]:font-bold [&_h2]:uppercase [&_ul]:ml-5 [&_ul]:list-disc [&_ul]:space-y-1.5">
        {children}
      </div>
    </article>
  );
}
