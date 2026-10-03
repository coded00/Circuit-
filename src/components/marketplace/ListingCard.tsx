import Link from "next/link";
import type { ListingCategory } from "@prisma/client";
import { sized } from "@/lib/imageUrl";
import { categoryLabel, formatListingPrice, isNewListing } from "@/lib/marketplace";
import { CategoryIcon } from "./categoryIcon";

export type ListingCardData = {
  id: string;
  title: string;
  category: ListingCategory;
  game: string | null;
  priceKobo: number;
  imageUrl: string | null;
  stock: number | null;
  createdAt: Date;
  seller: { handle: string; displayName: string };
};

/** A listing tile: picture (or the category mark when there isn't one), title, price, seller. */
export function ListingCard({ listing: l }: { listing: ListingCardData }) {
  return (
    <Link
      href={`/marketplace/${l.id}`}
      className="group cut-lg flex h-full flex-col overflow-hidden border border-border bg-surface transition duration-[var(--duration-base)] ease-[var(--ease-standard)] [--cut-line:var(--border)] hover:-translate-y-0.5 hover:border-border-hover active:translate-y-0 active:scale-[0.99]"
    >
      <div className={`relative aspect-[4/3] w-full overflow-hidden bg-surface-elevated ${l.stock === 0 ? "opacity-60" : ""}`}>
        {l.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- seller-uploaded or pasted image, arbitrary host and size
          <img src={sized(l.imageUrl, 400) ?? l.imageUrl} alt="" decoding="async" loading="lazy" className="h-full w-full object-cover transition-transform duration-[var(--duration-reveal)] group-hover:scale-[1.04]" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted/50">
            <CategoryIcon category={l.category} size={44} />
          </div>
        )}
        {l.stock !== null && l.stock <= 5 ? (
          <span className="cut-xs absolute top-3 right-3 bg-accent-orange px-2 py-1 font-mono text-[11px] font-semibold tracking-wide text-black uppercase">
            {l.stock === 0 ? "Sold out" : `${l.stock} left`}
          </span>
        ) : (
          isNewListing(l.createdAt) && (
            <span className="cut-xs absolute top-3 right-3 bg-accent-volt px-2 py-1 font-mono text-[11px] font-semibold tracking-wide text-accent-volt-foreground uppercase">New</span>
          )
        )}
        <span className="cut-xs absolute top-3 left-3 flex items-center gap-1 bg-black/70 px-2 py-1 font-mono text-[11px] font-semibold tracking-wide text-white uppercase">
          <CategoryIcon category={l.category} size={11} />
          {categoryLabel(l.category)}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <span className="line-clamp-2 font-display text-lg leading-[1.1] font-bold tracking-tight uppercase">{l.title}</span>
        {l.game && <span className="truncate font-mono text-[11px] tracking-wide text-muted uppercase">{l.game}</span>}
        <div className="mt-auto flex items-end justify-between gap-2 pt-1">
          <span className="text-stat text-lg text-gold">{formatListingPrice(l.priceKobo)}</span>
          <span className="min-w-0 truncate text-xs text-muted">@{l.seller.handle}</span>
        </div>
      </div>
    </Link>
  );
}
