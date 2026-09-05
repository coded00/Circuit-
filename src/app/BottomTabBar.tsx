import Link from "next/link";
import { getCurrentUser } from "@/lib/session";

/**
 * Circuit — mobile primary nav (docs/circuit-ui-references.md: start.gg's
 * bottom tab bar, judged the clearer answer than a hamburger drawer for
 * keeping high-frequency actions one tap away on the mid-range-Android/3G
 * conditions NFR-1 targets). Desktop keeps SiteHeader's top nav; this is
 * `sm:hidden` — one component set, reflowed, not a second build.
 */
export default async function BottomTabBar() {
  const user = await getCurrentUser();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-10 flex border-t border-border bg-background/95 backdrop-blur-md sm:hidden">
      <Link href="/" className="flex flex-1 flex-col items-center gap-0.5 py-2.5 text-xs text-muted">
        <span className="text-base">🏠</span>
        Home
      </Link>
      <Link href="/battles" className="flex flex-1 flex-col items-center gap-0.5 py-2.5 text-xs text-muted">
        <span className="text-base">⚔️</span>
        Battles
      </Link>
      <Link href="/ladder" className="flex flex-1 flex-col items-center gap-0.5 py-2.5 text-xs text-muted">
        <span className="text-base">🏆</span>
        Ladders
      </Link>
      <Link
        href={user ? "/tournaments/new" : "/signup"}
        className="flex flex-1 flex-col items-center gap-0.5 py-2.5 text-xs text-muted"
      >
        <span className="text-base">{user ? "➕" : "👤"}</span>
        {user ? "Create" : "Sign up"}
      </Link>
    </nav>
  );
}
