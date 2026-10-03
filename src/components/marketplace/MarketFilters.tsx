"use client";

import { useEffect, useRef, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { SORTS } from "@/lib/marketplace";

const PRICE_STEPS = [5_000, 10_000, 25_000, 50_000];

/** Search, sort, game, price ceiling and in-stock: every change updates the URL and the grid straight away, no Search button. */
export function MarketFilters({ games }: { games: string[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const inputRef = useRef<HTMLInputElement>(null);
  const urlQ = params.get("q") ?? "";

  // Clear (or any link that changes q) resets the box; a box being typed in is left alone.
  useEffect(() => {
    const el = inputRef.current;
    if (el && document.activeElement !== el && el.value.trim() !== urlQ) el.value = urlQ;
  }, [urlQ]);

  function update(patch: Record<string, string | null>) {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    const qs = next.toString();
    start(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  }

  useEffect(() => () => clearTimeout(timer.current), []);

  const sort = params.get("sort") ?? "new";
  const game = params.get("game") ?? "";
  const max = params.get("max") ?? "";
  const inStock = params.get("stock") === "1";
  const chip = (active: boolean) => `cut-xs min-h-9 px-3 py-1.5 text-xs font-medium transition ${active ? "bg-foreground text-background" : "bg-surface-elevated text-muted hover:text-foreground"}`;

  return (
    <div className="flex flex-col gap-3" aria-busy={pending}>
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative min-w-0 flex-1">
          <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" aria-hidden />
          <input
            ref={inputRef}
            defaultValue={params.get("q") ?? ""}
            onChange={(e) => {
              clearTimeout(timer.current);
              timer.current = setTimeout(() => update({ q: e.target.value.trim() || null }), 250);
            }}
            placeholder="Search the Marketplace"
            aria-label="Search the Marketplace"
            className="field-input w-full pl-9"
          />
        </div>
        <div className="flex gap-2">
          <select aria-label="Sort" value={sort} onChange={(e) => update({ sort: e.target.value === "new" ? null : e.target.value })} className="field-select">
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          {games.length > 0 && (
            <select aria-label="Game" value={game} onChange={(e) => update({ game: e.target.value || null })} className="field-select">
              <option value="">All games</option>
              {games.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>
      <div className="scrollbar-hide -mx-4 flex items-center gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <span className="shrink-0 text-xs text-muted">Price</span>
        <button type="button" onClick={() => update({ max: null })} className={chip(!max)}>
          Any
        </button>
        {PRICE_STEPS.map((n) => (
          <button key={n} type="button" onClick={() => update({ max: max === String(n) ? null : String(n) })} className={chip(max === String(n))}>
            Under ₦{n.toLocaleString("en-NG")}
          </button>
        ))}
        <span aria-hidden className="mx-1 h-4 w-px shrink-0 bg-border" />
        <button type="button" aria-pressed={inStock} onClick={() => update({ stock: inStock ? null : "1" })} className={chip(inStock)}>
          In stock
        </button>
      </div>
    </div>
  );
}
