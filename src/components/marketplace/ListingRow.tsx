import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ListingCard, type ListingCardData } from "./ListingCard";

/** A titled strip of listings that scrolls sideways on a phone and sits as a grid on wide screens. */
export function ListingRow({ title, hint, listings, href }: { title: string; hint?: string; listings: ListingCardData[]; href?: string }) {
  if (listings.length === 0) return null;
  return (
    <section className="cv-auto flex flex-col gap-3" aria-label={title}>
      <div className="flex items-end justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h2 className="font-display text-xl font-bold tracking-tight sm:text-2xl">{title}</h2>
          {hint && <p className="text-xs text-muted">{hint}</p>}
        </div>
        {href && (
          <Link href={href} className="-my-2 flex shrink-0 items-center gap-1 py-2 pl-3 text-sm font-medium text-accent-blue hover:underline">
            See all <ArrowRight size={14} aria-hidden />
          </Link>
        )}
      </div>
      <div data-stagger className="scrollbar-hide -mx-4 flex scroll-pl-4 snap-x gap-4 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-4">
        {listings.slice(0, 4).map((l) => (
          <div key={l.id} className="w-[72%] shrink-0 snap-start sm:w-auto">
            <ListingCard listing={l} />
          </div>
        ))}
      </div>
    </section>
  );
}
