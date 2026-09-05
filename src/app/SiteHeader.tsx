import Link from "next/link";
import { getCurrentUser } from "@/lib/session";
import LogoutButton from "./LogoutButton";

export default async function SiteHeader() {
  const user = await getCurrentUser();

  return (
    <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border bg-background/80 px-4 py-3 text-sm backdrop-blur-md sm:px-6">
      <div className="flex min-w-0 items-center gap-6">
        <Link href="/" className="flex shrink-0 items-center gap-1.5 font-semibold tracking-tight">
          <span className="h-2 w-2 rounded-full bg-brand" />
          Circuit
        </Link>
        {/* Battles/Ladders live in BottomTabBar on mobile — no squeezed
            duplicate nav here, per docs/circuit-ui-references.md. */}
        <nav className="hidden items-center gap-5 sm:flex">
          <Link href="/battles" className="text-muted transition hover:text-foreground">
            Battles
          </Link>
          <Link href="/ladder" className="text-muted transition hover:text-foreground">
            Ladders
          </Link>
          {user && (
            <Link href="/dashboard" className="text-muted transition hover:text-foreground">
              Dashboard
            </Link>
          )}
        </nav>
      </div>
      <div className="flex min-w-0 shrink-0 items-center gap-3 sm:gap-4">
        {user ? (
          <>
            <Link href={`/players/${user.handle}`} className="hidden truncate text-muted hover:text-foreground sm:inline">
              @{user.handle}
            </Link>
            <Link href="/account" className="text-muted transition hover:text-foreground">
              Account
            </Link>
            <LogoutButton />
          </>
        ) : (
          <>
            <Link href="/login" className="font-medium text-muted transition hover:text-foreground">
              Log in
            </Link>
            <Link
              href="/signup"
              className="rounded-full bg-brand px-4 py-1.5 font-medium text-brand-foreground transition hover:bg-brand-strong"
            >
              Sign up
            </Link>
          </>
        )}
      </div>
    </header>
  );
}
