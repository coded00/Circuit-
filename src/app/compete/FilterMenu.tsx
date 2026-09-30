"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, ChevronDown } from "lucide-react";

type Option = { value: string; label: string; href: string };

/**
 * A filter as a pill: "Entry" when nothing is chosen, "Entry: Free" once it is.
 * Opens a small menu of links (so every choice is a real URL). Escape or a tap
 * elsewhere closes it.
 */
export function FilterMenu({ label, options, active, align = "start" }: { label: string; options: Option[]; active: string; align?: "start" | "end" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const chosen = options.find((o) => o.value === active && o.value !== "");

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium transition ${
          chosen ? "border-foreground bg-foreground text-background" : "border-border bg-surface text-muted hover:border-border-strong hover:text-foreground"
        }`}
      >
        {label}
        {chosen && <span className="font-semibold">: {chosen.label}</span>}
        <ChevronDown size={14} className={`transition ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>
      {open && (
        <ul
          role="listbox"
          aria-label={label}
          className={`absolute top-full z-30 mt-2 min-w-44 rounded-[12px] border border-border bg-surface p-1 shadow-lg ${align === "end" ? "right-0" : "left-0"}`}
        >
          {options.map((o) => {
            const on = o.value === active;
            return (
              <li key={o.value || "any"} role="option" aria-selected={on}>
                <Link
                  href={o.href}
                  onClick={() => setOpen(false)}
                  className={`flex items-center justify-between gap-6 rounded-[8px] px-3 py-2 text-sm transition hover:bg-surface-elevated ${on ? "font-semibold" : "text-muted hover:text-foreground"}`}
                >
                  {o.label}
                  {on && <Check size={14} aria-hidden />}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
