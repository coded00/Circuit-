"use client";

import { useEffect, useState } from "react";

/** On a phone, keeps the price and a Buy button in reach once the real buy panel has scrolled out of view. */
export function StickyBuyBar({ title, price }: { title: string; price: string }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const panel = document.getElementById("buy-panel");
    if (!panel) return;
    const io = new IntersectionObserver(([entry]) => setShow(!entry.isIntersecting), { threshold: 0 });
    io.observe(panel);
    return () => io.disconnect();
  }, []);

  return (
    <div
      aria-hidden={!show}
      className={`fixed inset-x-0 bottom-[4.25rem] z-30 flex items-center justify-between gap-3 border-t border-border bg-background px-4 py-3 transition duration-[var(--duration-base)] md:hidden ${
        show ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-full opacity-0"
      }`}
    >
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-xs text-muted">{title}</span>
        <span className="text-stat text-lg text-gold">{price}</span>
      </span>
      <button type="button" tabIndex={show ? 0 : -1} onClick={() => document.getElementById("buy-panel")?.scrollIntoView({ behavior: "smooth", block: "center" })} className="btn-primary shrink-0">
        Buy
      </button>
    </div>
  );
}
