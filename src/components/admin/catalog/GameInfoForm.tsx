"use client";

/**
 * Circuit — the Game Information half of the builder (name, description,
 * cover + icon uploads, category, platforms, publisher). Creates the game
 * as a draft and routes into its builder, or saves edits in place.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { GAME_COVER_BOUNDS, ImageUploadField } from "@/components/ImageUploadField";
import { catalogRequest } from "./shared";

/** Quick picks only — any other platform can be typed in. */
const COMMON_PLATFORMS = ["Mobile", "PC", "PlayStation", "Xbox", "Nintendo Switch"];

export type GameInfo = {
  id: string;
  name: string;
  description: string | null;
  iconUrl: string | null;
  coverUrl: string | null;
  category: string | null;
  platforms: string[];
  publisher: string | null;
  slug: string | null;
  seoName: string | null;
  aliases: string[];
};

export function GameInfoForm({ game }: { game?: GameInfo }) {
  const router = useRouter();
  const [name, setName] = useState(game?.name ?? "");
  const [description, setDescription] = useState(game?.description ?? "");
  const [category, setCategory] = useState(game?.category ?? "");
  const [publisher, setPublisher] = useState(game?.publisher ?? "");
  const [slug, setSlug] = useState(game?.slug ?? "");
  const [seoName, setSeoName] = useState(game?.seoName ?? "");
  const [aliases, setAliases] = useState((game?.aliases ?? []).join(", "));
  const [platforms, setPlatforms] = useState<string[]>(game?.platforms ?? []);
  const [otherPlatform, setOtherPlatform] = useState("");
  const [iconUrl, setIconUrl] = useState(game?.iconUrl ?? "");
  const [coverUrl, setCoverUrl] = useState(game?.coverUrl ?? "");
  const [iconBlocked, setIconBlocked] = useState(false);
  const [coverBlocked, setCoverBlocked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const togglePlatform = (p: string) => setPlatforms((list) => (list.includes(p) ? list.filter((x) => x !== p) : [...list, p]));
  const customPlatforms = platforms.filter((p) => !COMMON_PLATFORMS.includes(p));

  function addOther() {
    const p = otherPlatform.trim();
    if (p && !platforms.includes(p)) setPlatforms([...platforms, p]);
    setOtherPlatform("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    const body = { name, slug, seoName, aliases, description, category, publisher, platforms, iconUrl: iconUrl || null, coverUrl: coverUrl || null };
    if (game) {
      const err = await catalogRequest("PATCH", `/api/admin/games/${game.id}`, body);
      setSaving(false);
      if (err) return setError(err);
      setSaved(true);
      router.refresh();
      return;
    }
    const res = await fetch("/api/admin/games", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => null);
    setSaving(false);
    if (!res.ok) return setError(data?.error ?? "Something went wrong.");
    router.replace(`/admin/games/${data.id}`);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 sm:col-span-2">
          <span className="field-label">Game name</span>
          <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. PUBG Mobile" className="field-input" />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="field-label">Full name for search <span className="text-muted">(optional)</span></span>
          <input value={seoName} onChange={(e) => setSeoName(e.target.value)} placeholder="e.g. Call of Duty: Mobile" className="field-input" />
          <span className="text-xs text-muted">Used in page titles when the game name above is an abbreviation.</span>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="field-label">Page address <span className="text-muted">(optional)</span></span>
          <input value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase())} placeholder="e.g. call-of-duty-mobile" className="field-input" />
          <span className="text-xs text-muted">The game page lives at /games/this-address. Changing it later redirects the old one.</span>
        </label>
        <label className="flex flex-col gap-1.5 sm:col-span-2">
          <span className="field-label">Also known as <span className="text-muted">(optional, separate with commas)</span></span>
          <input value={aliases} onChange={(e) => setAliases(e.target.value)} placeholder="e.g. CODM, COD Mobile" className="field-input" />
        </label>
        <label className="flex flex-col gap-1.5 sm:col-span-2">
          <span className="field-label">Description <span className="text-muted">(optional)</span></span>
          <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} className="field-textarea" />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="field-label">Category</span>
          <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. Battle Royale" className="field-input" />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="field-label">Publisher / developer</span>
          <input value={publisher} onChange={(e) => setPublisher(e.target.value)} placeholder="e.g. Krafton" className="field-input" />
        </label>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="field-label mb-1.5">Platforms</legend>
        <div className="flex flex-wrap items-center gap-2">
          {[...COMMON_PLATFORMS, ...customPlatforms].map((p) => {
            const on = platforms.includes(p);
            return (
              <button
                key={p}
                type="button"
                aria-pressed={on}
                onClick={() => togglePlatform(p)}
                className={`flex items-center gap-1 rounded-[9px] border px-3 py-1.5 text-[13px] font-medium transition ${
                  on ? "border-foreground bg-foreground text-background" : "border-border text-muted hover:border-border-hover hover:text-foreground"
                }`}
              >
                {p}
                {on && customPlatforms.includes(p) && <X size={12} />}
              </button>
            );
          })}
          <input
            value={otherPlatform}
            onChange={(e) => setOtherPlatform(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addOther();
              }
            }}
            onBlur={addOther}
            placeholder="Other…"
            className="field-input w-28 py-1.5 text-[13px]"
          />
        </div>
      </fieldset>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[2fr_1fr]">
        <ImageUploadField
          label="Cover image"
          purpose="game-cover"
          value={coverUrl}
          onChange={setCoverUrl}
          bounds={GAME_COVER_BOUNDS}
          onValidityChange={setCoverBlocked}
          hint={GAME_COVER_BOUNDS.recommended}
        />
        <ImageUploadField label="Icon" purpose="game-icon" value={iconUrl} onChange={setIconUrl} onValidityChange={setIconBlocked} hint="A square logo." />
      </div>

      {error && <p className="field-error">{error}</p>}
      <div className="flex items-center gap-3">
        <button type="submit" disabled={saving || iconBlocked || coverBlocked} className="btn-primary text-sm">
          {saving ? "Saving…" : game ? "Save game info" : "Create game"}
        </button>
        {saved && <span className="text-xs text-success">Saved</span>}
      </div>
    </form>
  );
}
