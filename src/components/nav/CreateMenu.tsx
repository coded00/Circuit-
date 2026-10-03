"use client";

/**
 * Circuit — "Create" header action (Phase 3 of the CIRCUIT UI spec):
 * "Dark background. Electric blue outline." — a distinct, calmer
 * treatment from the filled-gradient primary buttons used for actual
 * CTAs (Register Now, Explore Circuit), matching the same dark+outline
 * family as the header's own Go Live button.
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Plus, ChevronDown } from "lucide-react";

export function CreateMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-9 items-center gap-1.5 rounded-none px-3 text-sm font-semibold text-white transition hover:bg-white/[0.07]"
      >
        <Plus size={16} className="text-accent-volt" />
        Create
        <ChevronDown size={14} />
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-2 w-48 dropdown-panel py-1">
          <Link
            href="/tournaments/new"
            onClick={() => setOpen(false)}
            className="block px-4 py-2 text-sm hover:bg-surface-elevated"
          >
            New tournament
          </Link>
          <Link
            href="/battles/new"
            onClick={() => setOpen(false)}
            className="block px-4 py-2 text-sm hover:bg-surface-elevated"
          >
            Open a Battle
          </Link>
        </div>
      )}
    </div>
  );
}
