"use client";

/**
 * Circuit — mobile search entry point (Phase 17). `SearchInput` has been
 * `hidden` below the `sm` breakpoint since Phase 3 with no mobile
 * alternative — a real, if minor, functionality gap. Tapping this icon
 * swaps the header's logo/actions row for the same real SearchInput
 * component used on desktop (full dropdown-with-results included), not a
 * separate or reduced mobile search.
 */

import { useState } from "react";
import { Search, X } from "lucide-react";
import { SearchInput } from "@/components/SearchInput";

export function MobileSearchToggle() {
  const [open, setOpen] = useState(false);

  if (open) {
    // Covers the whole header bar (the header is `position: relative`) so
    // it doesn't need to coordinate hiding the logo/actions on its own —
    // simpler and can't drift out of sync with TopBar's own layout changes.
    return (
      <div className="absolute inset-0 z-20 flex items-center gap-2 bg-background px-5 sm:hidden">
        <SearchInput className="min-w-0 flex-1" />
        <button type="button" onClick={() => setOpen(false)} aria-label="Close search" className="btn-icon shrink-0">
          <X size={18} />
        </button>
      </div>
    );
  }

  return (
    <button type="button" onClick={() => setOpen(true)} aria-label="Search" className="btn-icon sm:hidden">
      <Search size={18} />
    </button>
  );
}
