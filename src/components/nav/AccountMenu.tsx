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
        className="flex items-center gap-2 rounded-full px-2 py-1 transition hover:bg-surface-hover"
      >
        {user.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- external, unpredictable-host avatar URLs
          <img src={user.avatarUrl} alt="" className="h-7 w-7 rounded-full border border-border object-cover" />
        ) : (
          <div className="flex h-7 w-7 items-center justify-center rounded-full border border-border bg-surface text-xs font-semibold text-muted">
            {user.displayName.slice(0, 1).toUpperCase()}
          </div>
        )}
        <span className="hidden text-sm font-medium sm:inline">{user.displayName}</span>
        <ChevronDown size={14} className="text-muted" />
      </button>

      {open && (
        <div className="absolute right-0 z-20 mt-2 w-48 rounded-xl border border-border bg-surface py-1 shadow-lg">
          <Link href={`/players/${user.handle}`} onClick={() => setOpen(false)} className="block px-4 py-2 text-sm hover:bg-surface-hover">
            My Profile
          </Link>
          <Link href="/account" onClick={() => setOpen(false)} className="block px-4 py-2 text-sm hover:bg-surface-hover">
            Account settings
          </Link>
          {user.isStaff && (
            <Link href="/staff/reports" onClick={() => setOpen(false)} className="block px-4 py-2 text-sm hover:bg-surface-hover">
              Staff tools
            </Link>
          )}
          <button
            type="button"
            onClick={handleLogout}
            className="block w-full px-4 py-2 text-left text-sm text-danger hover:bg-surface-hover"
          >
            Log out
          </button>
        </div>
      )}
    </div>
  );
}
