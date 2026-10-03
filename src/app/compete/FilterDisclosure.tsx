"use client";

import { useState } from "react";
import { ChevronDown, SlidersHorizontal } from "lucide-react";

/** On a phone the filter chips take four rows; this folds them behind one button. From `sm` up they just sit there. */
export function FilterDisclosure({ activeCount, children }: { activeCount: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex w-fit items-center gap-2 cut-xs border border-border bg-surface px-3.5 py-1.5 text-sm font-medium text-muted transition hover:text-foreground sm:hidden"
      >
        <SlidersHorizontal size={14} aria-hidden />
        Filters{activeCount > 0 ? ` (${activeCount})` : ""}
        <ChevronDown size={14} className={`transition ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>
      <div className={open ? "block" : "hidden sm:block"}>{children}</div>
    </div>
  );
}
