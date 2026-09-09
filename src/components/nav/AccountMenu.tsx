"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";

type NavUser = { handle: string; displayName: string; avatarUrl: string | null; isStaff: boolean };

export function AccountMenu({ user }: { user: NavUser }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2.5 rounded-full py-1 pr-2 pl-1 transition hover:bg-surface-elevated"
      >
        {user.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- external, unpredictable-host avatar URLs
          <img src={user.avatarUrl} alt="" className="h-9 w-9 rounded-full border-2 border-accent-blue/40 object-cover" />
        ) : (
          <div className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-accent-blue/40 bg-surface text-sm font-semibold text-muted">
            {user.displayName.slice(0, 1).toUpperCase()}
          </div>
        )}
        <span className="hidden flex-col items-start lg:flex">
          <span className="max-w-24 truncate text-sm leading-tight font-medium">{user.displayName}</span>
          {/* Static illustrative value — Circuit has no Level/XP system;
              per explicit product decision this spec's "Level 24" ships
              as decorative UI, not data. */}
          <span className="text-[10px] leading-tight text-muted-strong">Level 24</span>
        </span>
        <ChevronDown size={14} className="text-muted" />
      </button>

      {open && (
        <div className="absolute right-0 z-20 mt-2 w-48 dropdown-panel py-1">
          <Link href={`/players/${user.handle}`} onClick={() => setOpen(false)} className="block px-4 py-2 text-sm hover:bg-surface-elevated">
            My Profile
          </Link>
          <Link href="/account" onClick={() => setOpen(false)} className="block px-4 py-2 text-sm hover:bg-surface-elevated">
            Account settings
          </Link>
          {user.isStaff && (
            <Link href="/staff/reports" onClick={() => setOpen(false)} className="block px-4 py-2 text-sm hover:bg-surface-elevated">
              Staff tools
            </Link>
          )}
          <button
            type="button"
            onClick={handleLogout}
            className="block w-full px-4 py-2 text-left text-sm text-danger hover:bg-surface-elevated"
          >
            Log out
          </button>
        </div>
      )}
    </div>
  );
}
