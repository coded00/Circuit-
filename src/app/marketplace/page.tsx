/**
 * Circuit — Marketplace. With nothing selected it is a storefront: a staff
 * pick up top, four category doors, then themed rows (new, under ₦10k, nearly
 * gone). Search, a category, sort, price, game or in-stock turns it into a
 * filtered grid that updates as you type.
 */

import { Suspense } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { getCurrentUser } from "@/lib/session";
import { CHEAP_ROW_KOBO, LISTING_CATEGORIES, browseListings, canSell, marketplaceHome, parseCategory, parseMaxPriceNaira, parseSort } from "@/lib/marketplace";
import { ListingCard } from "@/components/marketplace/ListingCard";
import { ListingRow } from "@/components/marketplace/ListingRow";
import { CategoryTiles } from "@/components/marketplace/CategoryTiles";
import { MarketHero } from "@/components/marketplace/MarketHero";
import { MarketFilters } from "@/components/marketplace/MarketFilters";
import { CategoryIcon } from "@/components/marketplace/categoryIcon";
import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
  title: "Marketplace",
  description: "Gaming services, digital goods, in-game items and organizer merch on Circuit, paid from your wallet.",
  path: "/marketplace",
});

type SearchParams = { category?: string; q?: string; sort?: string; game?: string; max?: string; stock?: string };

export default async function MarketplacePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const category = parseCategory(sp.category);
  const q = sp.q?.trim() || undefined;
  const sort = parseSort(sp.sort);
  const maxPrice = parseMaxPriceNaira(sp.max);
  const game = sp.game?.trim() || null;
  const inStock = sp.stock === "1";
  const filtering = !!(category || q || game || maxPrice || inStock || sort !== "new");

  const user = await getCurrentUser();
  const home = await marketplaceHome(user?.id ?? null);

  const listings = filtering ? await browseListings(user?.id ?? null, { category, q, sort, maxPrice, game, inStock }) : [];
  const heroPicks = home.featured.length ? home.featured : home.fresh.slice(0, 1);

  const chip = (active: boolean) =>
    `flex shrink-0 items-center gap-1.5 cut-xs px-3.5 py-1.5 text-sm font-medium transition ${active ? "bg-foreground text-background" : "bg-surface-elevated text-muted hover:text-foreground"}`;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-4 py-6 sm:px-8 sm:py-10">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1.5">
          <span className="text-eyebrow text-accent-volt">Marketplace</span>
          <h1 className="font-display text-3xl leading-[0.98] font-bold tracking-tight uppercase sm:text-4xl">Equip yourself for what&apos;s coming.</h1>
          <p className="text-sm text-muted">
            <span className="text-stat text-foreground">{home.total}</span> on sale · paid from your wallet, delivered by Circuit
          </p>
        </div>
        {user && (
          <div className="flex gap-2 self-start sm:self-auto">
            <Link href="/marketplace/orders" className="btn-secondary">
              My orders
            </Link>
            {canSell(user) && (
              <Link href="/marketplace/new" className="btn-primary">
                <Plus size={15} />
                Sell something
              </Link>
            )}
          </div>
        )}
      </header>

      <Suspense>
        <MarketFilters games={home.games} />
      </Suspense>

      {filtering ? (
        <>
          <nav aria-label="Category" className="scrollbar-hide -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            <Link href="/marketplace" className={chip(!category)} aria-current={!category ? "page" : undefined}>
              All
            </Link>
            {LISTING_CATEGORIES.map((c) => (
              <Link key={c.value} href={`/marketplace?category=${c.value}`} className={chip(category === c.value)} aria-current={category === c.value ? "page" : undefined}>
                <CategoryIcon category={c.value} size={14} />
                {c.label}
              </Link>
            ))}
          </nav>
          <p className="-mt-3 text-sm text-muted" aria-live="polite">
            {listings.length} {listings.length === 1 ? "result" : "results"}
            {" · "}
            <Link href="/marketplace" className="text-accent-blue hover:underline">
              Clear filters
            </Link>
          </p>
          {listings.length === 0 ? (
            <div className="card state-block">
              <h2 className="state-title">Nothing matches</h2>
              <p className="state-description">Try a different search, raise the price ceiling, or clear the filters.</p>
              <Link href="/marketplace" className="btn-secondary">
                Clear filters
              </Link>
            </div>
          ) : (
            <section aria-label="Results" data-stagger className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {listings.map((l) => (
                <ListingCard key={l.id} listing={l} />
              ))}
            </section>
          )}
        </>
      ) : home.total === 0 ? (
        <div className="card state-block">
          <h2 className="state-title">The Marketplace is being stocked</h2>
          <p className="state-description">Circuit is adding coaching, passes, merch and top-ups. Check back soon.</p>
        </div>
      ) : (
        <>
          <MarketHero picks={heroPicks} total={home.total} />
          <CategoryTiles counts={home.countByCategory} />
          <ListingRow title="Just added" hint="The newest things on sale" listings={home.fresh} href="/marketplace?sort=new&category=" />
          <ListingRow title={`Under ₦${(CHEAP_ROW_KOBO / 100).toLocaleString("en-NG")}`} hint="Easy picks, in stock now" listings={home.cheap} href={`/marketplace?max=${CHEAP_ROW_KOBO / 100}&sort=price-asc&stock=1`} />
          <ListingRow title="Going fast" hint="Five or fewer left" listings={home.limited} href="/marketplace?sort=price-asc&stock=1" />
        </>
      )}
    </div>
  );
}
