/**
 * Circuit — shared shell for the four auth pages (login, signup,
 * forgot-password, reset-password): a real image on one side, the form
 * on the other. The image (`/public/auth-hero.jpg`) is a finished,
 * pre-composed brand piece — logo, "More Than A Game" tagline, and
 * supporting copy are already baked into it — not a mood photo needing
 * a separate text overlay the way the old Unsplash placeholder did, so
 * this panel is just the image with a light vignette for depth, no
 * duplicate logo/headline on top of it.
 *
 * Hidden below `lg` — the image is brand dressing, not load-bearing;
 * mobile gets the form full-width instead. At `lg`+, both halves are an
 * explicit, equal 50/50 split (`lg:w-1/2` on both), form on the left,
 * image on the right.
 *
 * These routes render outside the normal app shell (see AppShell.tsx),
 * so this component owns the full viewport itself.
 */
export function AuthSplitLayout({ children }: { children: React.ReactNode }) {
  return (
    // dvh, not vh/screen — iOS Safari's dynamic URL bar makes 100vh taller
    // than what's actually visible on load, which would force this page
    // to scroll on first paint for no real reason.
    <div className="flex min-h-dvh w-full bg-background">
      <div className="flex w-full flex-col items-center justify-center px-6 py-16 lg:w-1/2 lg:shrink-0">
        <div className="w-full max-w-sm">{children}</div>
      </div>

      <div className="relative hidden shrink-0 overflow-hidden lg:block lg:w-1/2">
        {/* eslint-disable-next-line @next/next/no-img-element -- local /public asset, no next/image usage elsewhere in this codebase */}
        <img src="/auth-hero.jpg" alt="Circuit — more than a game" className="absolute inset-0 h-full w-full object-cover" />
        <div
          aria-hidden
          className="absolute inset-0"
          style={{ backgroundImage: "linear-gradient(190deg, rgba(10,10,12,0), rgba(10,10,12,0.35))" }}
        />
      </div>
    </div>
  );
}
