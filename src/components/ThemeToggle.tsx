"use client";

import { Moon, Sun } from "lucide-react";
import { THEME_STORAGE_KEY } from "@/lib/theme";

/**
 * Circuit — site-wide light/dark switch. Flips `data-theme` on <html>,
 * which globals.css maps onto the same dark palette `data-surface="dark"`
 * sections already use, and remembers the choice in localStorage.
 *
 * Light stays the default ("light to discover") — nobody gets switched to
 * dark just because their OS is in dark mode; it's an explicit choice.
 *
 * The icon swap is pure CSS (`dark:` variant), not React state: the
 * server can't know the stored theme, so rendering the icon from state
 * would either flash the wrong icon or cause a hydration mismatch. The
 * attribute itself is applied before first paint by THEME_INIT_SCRIPT
 * (src/lib/theme.ts), inlined in layout.tsx.
 */

function toggleTheme() {
  const root = document.documentElement;
  const next = root.dataset.theme === "dark" ? "light" : "dark";
  if (next === "dark") root.dataset.theme = "dark";
  else delete root.dataset.theme;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, next);
  } catch {
    // Private mode / blocked storage — the switch still works for this visit.
  }
}

export function ThemeToggle({ variant = "icon", onToggle }: { variant?: "icon" | "row" | "menu"; onToggle?: () => void }) {
  const handleClick = () => {
    toggleTheme();
    onToggle?.();
  };

  // A dropdown-menu item (the header's account menu), matching its rows.
  if (variant === "menu") {
    return (
      <button type="button" onClick={handleClick} className="flex w-full items-center gap-2.5 px-4 py-2 text-left text-sm hover:bg-surface-elevated">
        <Moon size={15} className="shrink-0 text-muted dark:hidden" />
        <Sun size={15} className="hidden shrink-0 text-muted dark:block" />
        <span className="flex-1 dark:hidden">Dark mode</span>
        <span className="hidden flex-1 dark:inline">Light mode</span>
      </button>
    );
  }

  if (variant === "row") {
    return (
      <button
        type="button"
        onClick={handleClick}
        className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm"
      >
        <Moon size={18} className="dark:hidden" />
        <Sun size={18} className="hidden dark:block" />
        <span className="dark:hidden">Dark mode</span>
        <span className="hidden dark:inline">Light mode</span>
      </button>
    );
  }

  return (
    <button type="button" onClick={handleClick} aria-label="Toggle dark mode" title="Toggle dark mode" className="btn-icon">
      <Moon size={18} className="dark:hidden" />
      <Sun size={18} className="hidden dark:block" />
    </button>
  );
}
