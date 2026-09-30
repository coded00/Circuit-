"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Info } from "lucide-react";

/**
 * A small "i" that explains something in a sentence or two. Opens on hover and
 * keyboard focus, and toggles on tap so it works on phones; Escape or a tap
 * elsewhere closes it. Keep the text short — anything longer belongs on the page.
 */
export function InfoTip({ text, label = "More info", align = "start" }: { text: string; label?: string; align?: "start" | "end" }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <span ref={ref} className="relative inline-flex" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        aria-label={label}
        aria-describedby={open ? id : undefined}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="inline-flex h-4 w-4 items-center justify-center rounded-full text-muted transition hover:text-foreground focus-visible:text-foreground"
      >
        <Info size={13} aria-hidden />
      </button>
      {open && (
        <span
          role="tooltip"
          id={id}
          className={`absolute top-full z-30 mt-1.5 w-56 rounded-[10px] border border-border bg-surface-elevated px-3 py-2 text-xs font-normal normal-case leading-snug tracking-normal text-foreground shadow-lg ${
            align === "end" ? "right-0" : "left-0"
          }`}
        >
          {text}
        </span>
      )}
    </span>
  );
}
