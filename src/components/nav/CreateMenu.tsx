"use client";

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
      <button type="button" onClick={() => setOpen((v) => !v)} className="btn-primary gap-1.5 px-4 py-2">
        <Plus size={16} />
        Create
        <ChevronDown size={14} />
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-2 w-48 rounded-xl border border-border bg-surface py-1 shadow-lg">
          <Link
            href="/tournaments/new"
            onClick={() => setOpen(false)}
            className="block px-4 py-2 text-sm hover:bg-surface-hover"
          >
            New tournament
          </Link>
          <Link
            href="/battles/new"
            onClick={() => setOpen(false)}
            className="block px-4 py-2 text-sm hover:bg-surface-hover"
          >
            Open a Battle
          </Link>
        </div>
      )}
    </div>
  );
}
