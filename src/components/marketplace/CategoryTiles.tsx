import Link from "next/link";
import type { ListingCategory } from "@prisma/client";
import { LISTING_CATEGORIES } from "@/lib/marketplace";
import { CategoryIcon } from "./categoryIcon";

/** Four doors into the Marketplace, each with how many things are behind it. */
export function CategoryTiles({ counts }: { counts: Partial<Record<ListingCategory, number>> }) {
  return (
    <nav aria-label="Shop by category" data-stagger className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {LISTING_CATEGORIES.map((c) => (
        <Link
          key={c.value}
          href={`/marketplace?category=${c.value}`}
          className="group cut-lg flex flex-col gap-2 border border-border bg-surface p-4 transition duration-[var(--duration-base)] [--cut-line:var(--border)] hover:-translate-y-0.5 hover:border-accent-volt/50"
        >
          <span className="flex h-10 w-10 items-center justify-center bg-surface-elevated text-accent-volt transition group-hover:bg-accent-volt group-hover:text-accent-volt-foreground">
            <CategoryIcon category={c.value} size={20} />
          </span>
          <span className="font-display text-lg leading-none font-bold tracking-tight uppercase">{c.label}</span>
          <span className="hidden text-xs text-muted sm:block">{c.blurb}</span>
          <span className="font-mono text-[11px] text-muted">{counts[c.value] ?? 0} listed</span>
        </Link>
      ))}
    </nav>
  );
}
