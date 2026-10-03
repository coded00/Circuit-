/**
 * Circuit — Marketplace rules shared by the pages and API routes: the four
 * categories, listing validation, and the one "who can see this listing"
 * filter. First slice is listing and browsing only; no checkout yet.
 */

import type { ListingCategory, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { blockedEitherWay } from "@/lib/blocks";
import { parseOptionalImageUrl, parseOptionalUrl } from "@/lib/validation";

export const LISTING_CATEGORIES: { value: ListingCategory; label: string; blurb: string; sellHint: string }[] = [
  { value: "SERVICE", label: "Services", blurb: "Coaching, team spots, edits and other help from players.", sellHint: "Coaching, a spot on your team, thumbnails, clips edited." },
  { value: "DIGITAL", label: "Digital goods", blurb: "Guides, cosmetics, gift cards and other things delivered online.", sellHint: "A strategy guide, an overlay pack, a gift card." },
  { value: "ITEM", label: "Items & accounts", blurb: "In-game items, currency and accounts, player to player.", sellHint: "Skins, in-game currency, a levelled account." },
  { value: "STORE", label: "Organizer store", blurb: "Merch, entry bundles and passes from organizers and brands.", sellHint: "Merch, a bundle of tournament entries, a season pass." },
];

export function categoryLabel(value: ListingCategory): string {
  return LISTING_CATEGORIES.find((c) => c.value === value)?.label ?? value;
}

export function parseCategory(value: unknown): ListingCategory | null {
  return LISTING_CATEGORIES.some((c) => c.value === value) ? (value as ListingCategory) : null;
}

/** Who may sell. For now only Circuit staff; opening it to everyone later is
 *  this one function (plus whatever seller checks we decide on then). */
export function canSell(user: { isStaff: boolean }): boolean {
  return user.isStaff;
}

export const LISTING_TITLE_MAX = 80;
export const LISTING_DESCRIPTION_MAX = 2000;
export const LISTING_MAX_STOCK = 10_000;
export const BUYER_PROMPT_MAX = 80;
export const BUYER_NOTE_MAX = 300;
export const LISTING_MIN_PRICE = 10_000; // ₦100, in kobo
export const LISTING_MAX_PRICE = 100_000_000; // ₦1,000,000
/** A seller can have this many live (active or paused) listings at once. */
export const LISTING_MAX_LIVE_PER_SELLER = 30;

export type ListingInput = {
  category: ListingCategory;
  title: string;
  description: string;
  game: string | null;
  priceKobo: number;
  imageUrl: string | null;
  /** Units for sale; null = unlimited. */
  stock: number | null;
  /** What the buyer must tell us at checkout; null = nothing. */
  buyerPrompt: string | null;
  featured: boolean;
  /** Private download link for instant delivery; null = delivered by hand. */
  deliveryUrl: string | null;
};

export function parseListingInput(body: unknown): { ok: true; value: ListingInput } | { ok: false; error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const category = parseCategory(b.category);
  if (!category) return { ok: false, error: "Pick a category." };
  const title = typeof b.title === "string" ? b.title.trim() : "";
  if (title.length < 3 || title.length > LISTING_TITLE_MAX) return { ok: false, error: `Give it a title of 3 to ${LISTING_TITLE_MAX} characters.` };
  const description = typeof b.description === "string" ? b.description.trim() : "";
  if (description.length < 10 || description.length > LISTING_DESCRIPTION_MAX) {
    return { ok: false, error: `Describe it in 10 to ${LISTING_DESCRIPTION_MAX} characters.` };
  }
  const priceKobo = typeof b.priceKobo === "number" && Number.isInteger(b.priceKobo) ? b.priceKobo : NaN;
  if (!(priceKobo >= LISTING_MIN_PRICE && priceKobo <= LISTING_MAX_PRICE)) {
    return { ok: false, error: `Price must be between ₦${LISTING_MIN_PRICE / 100} and ₦${(LISTING_MAX_PRICE / 100).toLocaleString("en-NG")}.` };
  }
  const image = parseOptionalImageUrl(b.imageUrl);
  if (!image.ok) return { ok: false, error: "That image link isn't valid." };
  const game = typeof b.game === "string" && b.game.trim() ? b.game.trim().slice(0, 60) : null;
  let stock: number | null = null;
  if (b.stock !== null && b.stock !== undefined && b.stock !== "") {
    if (typeof b.stock !== "number" || !Number.isInteger(b.stock) || b.stock < 0 || b.stock > LISTING_MAX_STOCK) {
      return { ok: false, error: `Stock must be a whole number from 0 to ${LISTING_MAX_STOCK}, or left empty for unlimited.` };
    }
    stock = b.stock;
  }
  let deliveryUrl: string | null = null;
  if (typeof b.deliveryUrl === "string" && b.deliveryUrl.trim()) {
    const link = parseOptionalUrl(b.deliveryUrl);
    if (!link.ok || !link.url?.toLowerCase().startsWith("https://")) return { ok: false, error: "The download link must be a secure https:// link." };
    deliveryUrl = link.url;
  }
  const buyerPrompt = typeof b.buyerPrompt === "string" && b.buyerPrompt.trim() ? b.buyerPrompt.trim().slice(0, BUYER_PROMPT_MAX) : null;
  return { ok: true, value: { category, title, description, game, priceKobo, imageUrl: image.url, stock, buyerPrompt, featured: b.featured === true, deliveryUrl } };
}

/** Listings a viewer may see: live, from sellers who aren't suspended and
 *  who haven't blocked them (or been blocked by them). */
export async function visibleListingsWhere(viewerId: string | null): Promise<Prisma.ListingWhereInput> {
  const hidden = viewerId ? await blockedEitherWay(viewerId) : [];
  return {
    status: "ACTIVE",
    seller: { isSuspended: false, ...(hidden.length ? { id: { notIn: hidden } } : {}) },
  };
}

export const SORTS = [
  { value: "new", label: "Newest", orderBy: { createdAt: "desc" } },
  { value: "price-asc", label: "Price: low to high", orderBy: { priceKobo: "asc" } },
  { value: "price-desc", label: "Price: high to low", orderBy: { priceKobo: "desc" } },
] as const satisfies readonly { value: string; label: string; orderBy: Prisma.ListingOrderByWithRelationInput }[];
export type SortKey = (typeof SORTS)[number]["value"];

export function parseSort(value: unknown): SortKey {
  return SORTS.find((s) => s.value === value)?.value ?? "new";
}

/** Whole-naira ceiling from a query param; null when absent or not a sensible number. */
export function parseMaxPriceNaira(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(n) && n > 0 && n <= LISTING_MAX_PRICE / 100 ? Math.floor(n) : null;
}

export type BrowseFilters = {
  category?: ListingCategory | null;
  q?: string;
  game?: string | null;
  sort?: SortKey;
  /** Naira ceiling. */
  maxPrice?: number | null;
  inStock?: boolean;
};

const CARD_INCLUDE = { seller: { select: { handle: true, displayName: true, avatarUrl: true } } } as const;
/** Lists never carry the private download link: it is only ever read by the download route. */
const PUBLIC_FIELDS = { deliveryUrl: true } as const;

export async function browseListings(viewerId: string | null, filters: BrowseFilters, take = 48) {
  const base = await visibleListingsWhere(viewerId);
  const q = filters.q?.trim();
  return prisma.listing.findMany({
    where: {
      ...base,
      ...(filters.category ? { category: filters.category } : {}),
      ...(filters.game ? { game: filters.game } : {}),
      ...(filters.maxPrice ? { priceKobo: { lte: filters.maxPrice * 100 } } : {}),
      ...(filters.inStock ? { OR: [{ stock: null }, { stock: { gt: 0 } }] } : {}),
      ...(q ? { AND: [{ OR: [{ title: { contains: q, mode: "insensitive" } }, { description: { contains: q, mode: "insensitive" } }] }] } : {}),
    },
    orderBy: SORTS.find((s) => s.value === (filters.sort ?? "new"))!.orderBy,
    take,
    include: CARD_INCLUDE,
    omit: PUBLIC_FIELDS,
  });
}

/** What the Marketplace home shows when nobody is filtering: a hero pick, a few themed rows, per-category counts, and the games on sale. */
export async function marketplaceHome(viewerId: string | null) {
  const base = await visibleListingsWhere(viewerId);
  const inStock = { OR: [{ stock: null }, { stock: { gt: 0 } }] };
  const [featured, fresh, cheap, limited, counts, games] = await Promise.all([
    prisma.listing.findMany({ where: { ...base, featured: true }, orderBy: { createdAt: "desc" }, take: 8, include: CARD_INCLUDE, omit: PUBLIC_FIELDS }),
    prisma.listing.findMany({ where: base, orderBy: { createdAt: "desc" }, take: 8, include: CARD_INCLUDE, omit: PUBLIC_FIELDS }),
    prisma.listing.findMany({ where: { ...base, ...inStock, priceKobo: { lte: CHEAP_ROW_KOBO } }, orderBy: { priceKobo: "asc" }, take: 8, include: CARD_INCLUDE, omit: PUBLIC_FIELDS }),
    prisma.listing.findMany({ where: { ...base, stock: { gt: 0, lte: 5 } }, orderBy: { stock: "asc" }, take: 8, include: CARD_INCLUDE, omit: PUBLIC_FIELDS }),
    prisma.listing.groupBy({ by: ["category"], where: base, _count: { _all: true } }),
    prisma.listing.findMany({ where: { ...base, game: { not: null } }, distinct: ["game"], select: { game: true }, orderBy: { game: "asc" } }),
  ]);
  return {
    featured,
    fresh,
    cheap,
    limited,
    total: counts.reduce((n, c) => n + c._count._all, 0),
    countByCategory: Object.fromEntries(counts.map((c) => [c.category, c._count._all])) as Partial<Record<ListingCategory, number>>,
    games: games.map((g) => g.game!).filter(Boolean),
  };
}

/** Other live listings in the same category, for the bottom of a product page. */
export async function relatedListings(viewerId: string | null, listing: { id: string; category: ListingCategory }, take = 4) {
  const base = await visibleListingsWhere(viewerId);
  return prisma.listing.findMany({ where: { ...base, category: listing.category, id: { not: listing.id } }, orderBy: { createdAt: "desc" }, take, include: CARD_INCLUDE, omit: PUBLIC_FIELDS });
}

/** The "Under ₦X" row's ceiling. */
export const CHEAP_ROW_KOBO = 1_000_000; // ₦10,000

/** A listing counts as new for its first three days. */
export const isNewListing = (createdAt: Date) => Date.now() - createdAt.getTime() < 3 * 24 * 60 * 60 * 1000;

export const formatListingPrice = (kobo: number) => `₦${(kobo / 100).toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;
