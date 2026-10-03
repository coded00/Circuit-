"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { OptionCard } from "@/components/OptionCard";
import { ImageUploadField } from "@/components/ImageUploadField";
import { BUYER_PROMPT_MAX, LISTING_CATEGORIES, LISTING_DESCRIPTION_MAX, LISTING_MAX_STOCK, LISTING_MAX_PRICE, LISTING_MIN_PRICE, LISTING_TITLE_MAX } from "@/lib/marketplace";
import type { ListingCategory } from "@prisma/client";

export type ListingFormInitial = {
  id: string;
  category: ListingCategory;
  title: string;
  description: string;
  game: string | null;
  priceKobo: number;
  imageUrl: string | null;
  stock: number | null;
  buyerPrompt: string | null;
  featured: boolean;
  deliveryUrl: string | null;
};

/** Create a listing, or edit one when `listing` is given. `admin` sends the
 *  admin back to the admin screens instead of the public listing page. */
export default function ListingForm({ games, listing, admin = false }: { games: { id: string; name: string }[]; listing?: ListingFormInitial; admin?: boolean }) {
  const router = useRouter();
  const [category, setCategory] = useState<ListingCategory>(listing?.category ?? "SERVICE");
  const [title, setTitle] = useState(listing?.title ?? "");
  const [description, setDescription] = useState(listing?.description ?? "");
  const [game, setGame] = useState(listing?.game ?? "");
  const [priceNaira, setPriceNaira] = useState(listing ? String(listing.priceKobo / 100) : "");
  const [imageUrl, setImageUrl] = useState(listing?.imageUrl ?? "");
  const [stock, setStock] = useState(listing?.stock != null ? String(listing.stock) : "");
  const [buyerPrompt, setBuyerPrompt] = useState(listing?.buyerPrompt ?? "");
  const [featured, setFeatured] = useState(listing?.featured ?? false);
  const [deliveryUrl, setDeliveryUrl] = useState(listing?.deliveryUrl ?? "");
  const [saved, setSaved] = useState(false);
  const [imageBusy, setImageBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const hint = LISTING_CATEGORIES.find((c) => c.value === category)?.sellHint;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSaved(false);
    setSubmitting(true);
    const res = await fetch(listing ? `/api/marketplace/listings/${listing.id}` : "/api/marketplace/listings", {
      method: listing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category, title, description, game: game || null, priceKobo: Math.round(Number(priceNaira || 0) * 100), imageUrl: imageUrl || null,
        stock: stock === "" ? null : Number(stock),
        buyerPrompt: buyerPrompt || null,
        featured,
        deliveryUrl: deliveryUrl || null,
      }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setError(data?.error ?? "Something went wrong. Please try again.");
      setSubmitting(false);
      return;
    }
    if (listing) {
      setSaved(true);
      setSubmitting(false);
      router.refresh();
      return;
    }
    router.replace(admin ? `/admin/marketplace/${data.id}` : `/marketplace/${data.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="card flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <span className="field-label">What are you selling?</span>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {LISTING_CATEGORIES.map((c) => (
            <OptionCard key={c.value} selected={category === c.value} onSelect={() => setCategory(c.value)} title={c.label} description={c.blurb} />
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="title" className="field-label">
          Title
        </label>
        <input id="title" required maxLength={LISTING_TITLE_MAX} value={title} onChange={(e) => setTitle(e.target.value)} className="field-input" />
        {hint && <span className="field-hint">For example: {hint}</span>}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="description" className="field-label">
          Description
        </label>
        <textarea
          id="description"
          required
          rows={5}
          maxLength={LISTING_DESCRIPTION_MAX}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="field-input"
        />
        <span className="field-hint">What the buyer gets, how it&apos;s delivered, and anything they should know.</span>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="priceNaira" className="field-label">
            Price (₦)
          </label>
          <input
            id="priceNaira"
            type="number"
            required
            min={LISTING_MIN_PRICE / 100}
            max={LISTING_MAX_PRICE / 100}
            step="1"
            value={priceNaira}
            onChange={(e) => setPriceNaira(e.target.value)}
            className="field-input"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="game" className="field-label">
            Game (optional)
          </label>
          <select id="game" value={game} onChange={(e) => setGame(e.target.value)} className="field-input">
            <option value="">Any / not game-specific</option>
            {games.map((g) => (
              <option key={g.id} value={g.name}>
                {g.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="stock" className="field-label">
            Stock (optional)
          </label>
          <input id="stock" type="number" min={0} max={LISTING_MAX_STOCK} step="1" value={stock} onChange={(e) => setStock(e.target.value)} className="field-input" />
          <span className="field-hint">Leave empty for unlimited. At zero the listing shows as sold.</span>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="buyerPrompt" className="field-label">
            Ask the buyer for (optional)
          </label>
          <input
            id="buyerPrompt"
            maxLength={BUYER_PROMPT_MAX}
            placeholder="e.g. Your in-game name"
            value={buyerPrompt}
            onChange={(e) => setBuyerPrompt(e.target.value)}
            className="field-input"
          />
          <span className="field-hint">They must answer this at checkout, so you can deliver.</span>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="deliveryUrl" className="field-label">
          Instant download link (optional)
        </label>
        <input id="deliveryUrl" type="url" placeholder="https://" value={deliveryUrl} onChange={(e) => setDeliveryUrl(e.target.value)} className="field-input" />
        <span className="field-hint">
          For ebooks and other files hosted elsewhere. Buyers get it the moment they pay, through a signed-in download button. The link itself is never shown on the site, but anyone who buys can see
          where it points, so use a host that lets you expire or rotate links.
        </span>
      </div>

      <label className="flex cursor-pointer items-start gap-3">
        <input type="checkbox" checked={featured} onChange={(e) => setFeatured(e.target.checked)} className="mt-1 h-4 w-4 accent-[var(--accent-volt)]" />
        <span className="flex flex-col">
          <span className="text-sm font-semibold">Feature on the Marketplace home</span>
          <span className="field-hint">Shown in the top banner and the Featured row.</span>
        </span>
      </label>

      <ImageUploadField label="Picture (optional)" value={imageUrl} onChange={setImageUrl} purpose="listing" onValidityChange={setImageBusy} />

      {error && (
        <p role="alert" className="alert alert-danger">
          {error}
        </p>
      )}
      {saved && (
        <p role="status" className="text-sm text-success">
          Saved.
        </p>
      )}
      <button type="submit" disabled={submitting || imageBusy} className="btn-primary self-start">
        {submitting ? "Saving…" : listing ? "Save changes" : "List it"}
      </button>
    </form>
  );
}
