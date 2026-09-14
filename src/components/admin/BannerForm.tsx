"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";

type Banner = {
  id: string;
  headline: string;
  description: string | null;
  imageUrl: string;
  ctaLabel: string | null;
  ctaHref: string | null;
  publishAt: string | null;
};

// The hero renders full-bleed, fixed height (280/320/360px at
// mobile/tablet/desktop) and fluid, `object-cover`-cropped width — so no
// single image is ever distorted, but a source that's too small gets
// visibly blurry when stretched, and one that's too square/tall gets
// most of its subject cropped away on a wide screen. These bounds are
// the real, checked constraint: too small or the wrong shape is
// rejected before it can be saved, not just discouraged with a hint.
const MIN_WIDTH = 1200;
const MIN_HEIGHT = 300;
const MIN_RATIO = 1.5; // taller than this (e.g. a square/portrait photo) crops away too much on desktop
const MAX_RATIO = 4; // wider than this (a thin panorama strip) crops away too much on mobile
const RECOMMENDED = "1600×500px (a landscape banner, roughly 3:1) works best across every screen size.";

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function checkImageSize(width: number, height: number): string | null {
  if (width < MIN_WIDTH || height < MIN_HEIGHT) {
    return `Too small (${width}×${height}px) — needs at least ${MIN_WIDTH}×${MIN_HEIGHT}px so it doesn't blur when stretched.`;
  }
  const ratio = width / height;
  if (ratio < MIN_RATIO) {
    return `Too narrow/tall (${width}×${height}px, ${ratio.toFixed(1)}:1) — this crops away most of the image on wide screens. Use a landscape banner.`;
  }
  if (ratio > MAX_RATIO) {
    return `Too wide/thin (${width}×${height}px, ${ratio.toFixed(1)}:1) — this crops away too much on narrow screens. ${RECOMMENDED}`;
  }
  return null;
}

/**
 * Circuit — create/edit form for a `HomepageBanner`. `imageUrl` is a
 * pasted URL, not a file upload — Circuit has no upload/object-storage
 * pipeline anywhere (see the model's own schema comment). Real size
 * validation happens client-side once the image actually loads (see
 * `checkImageSize`) — there's no way to check dimensions from a URL
 * string alone, so this can't be enforced server-side without fetching
 * and decoding the image there too, which wasn't worth the extra
 * round-trip for a staff-only form.
 */
export function BannerForm({ banner, onDone }: { banner?: Banner; onDone: () => void }) {
  const router = useRouter();
  const uid = useId();
  const [headline, setHeadline] = useState(banner?.headline ?? "");
  const [description, setDescription] = useState(banner?.description ?? "");
  const [imageUrl, setImageUrl] = useState(banner?.imageUrl ?? "");
  const [ctaLabel, setCtaLabel] = useState(banner?.ctaLabel ?? "");
  const [ctaHref, setCtaHref] = useState(banner?.ctaHref ?? "");
  const [publishAt, setPublishAt] = useState(toLocalInput(banner?.publishAt ?? null));
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [imageStatus, setImageStatus] = useState<
    { state: "checking" } | { state: "ok"; width: number; height: number } | { state: "invalid"; message: string } | null
  >(null);

  function handleImageLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    const { naturalWidth: width, naturalHeight: height } = e.currentTarget;
    const problem = checkImageSize(width, height);
    setImageStatus(problem ? { state: "invalid", message: problem } : { state: "ok", width, height });
  }

  function handleImageError() {
    setImageStatus({ state: "invalid", message: "Couldn't load an image from that URL." });
  }

  function handleImageUrlChange(value: string) {
    setImageUrl(value);
    setImageStatus(value ? { state: "checking" } : null);
  }

  const blockedBySize = imageStatus?.state === "invalid";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (blockedBySize) return;
    setSubmitting(true);
    setError(null);

    const body = {
      headline,
      description: description || null,
      imageUrl,
      ctaLabel: ctaLabel || null,
      ctaHref: ctaHref || null,
      publishAt: publishAt ? new Date(publishAt).toISOString() : null,
    };

    const res = await fetch(banner ? `/api/admin/banners/${banner.id}` : "/api/admin/banners", {
      method: banner ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setError(data?.error ?? "Something went wrong.");
      setSubmitting(false);
      return;
    }
    setSubmitting(false);
    router.refresh();
    onDone();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 border-t border-border pt-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${uid}-headline`} className="field-label">Headline</label>
          <input id={`${uid}-headline`} required value={headline} onChange={(e) => setHeadline(e.target.value)} className="field-input" />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${uid}-image`} className="field-label">Image URL</label>
          <input
            id={`${uid}-image`}
            required
            type="url"
            value={imageUrl}
            onChange={(e) => handleImageUrlChange(e.target.value)}
            placeholder="https://…"
            className="field-input"
          />
          <span className="field-hint">Recommended size: {RECOMMENDED}</span>
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${uid}-description`} className="field-label">Description (optional)</label>
        <input id={`${uid}-description`} value={description} onChange={(e) => setDescription(e.target.value)} className="field-input" />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${uid}-cta-label`} className="field-label">CTA label (optional)</label>
          <input id={`${uid}-cta-label`} value={ctaLabel} onChange={(e) => setCtaLabel(e.target.value)} placeholder="Start Competing" className="field-input" />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${uid}-cta-href`} className="field-label">CTA link (optional)</label>
          <input id={`${uid}-cta-href`} value={ctaHref} onChange={(e) => setCtaHref(e.target.value)} placeholder="/compete" className="field-input" />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${uid}-publish-at`} className="field-label">Publish at (optional)</label>
          <input id={`${uid}-publish-at`} type="datetime-local" value={publishAt} onChange={(e) => setPublishAt(e.target.value)} className="field-input" />
        </div>
      </div>

      {imageUrl && (
        <div className="flex flex-col gap-1.5">
          <div className="relative h-32 w-full overflow-hidden rounded-[10px] border border-border">
            {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary admin-pasted preview URL, dimensions read via onLoad below */}
            <img src={imageUrl} alt="" className="h-full w-full object-cover" onLoad={handleImageLoad} onError={handleImageError} />
          </div>
          {imageStatus?.state === "ok" && (
            <span className="text-xs text-success">
              ✓ {imageStatus.width}×{imageStatus.height}px — good to use.
            </span>
          )}
          {imageStatus?.state === "invalid" && <p className="field-error">{imageStatus.message}</p>}
        </div>
      )}

      {error && <p className="field-error">{error}</p>}

      <div className="flex gap-2">
        <button type="submit" disabled={submitting || blockedBySize} className="btn-primary text-sm">
          {submitting ? "Saving…" : banner ? "Save changes" : "Create banner"}
        </button>
        <button type="button" onClick={onDone} className="btn-ghost text-sm">
          Cancel
        </button>
      </div>
    </form>
  );
}
