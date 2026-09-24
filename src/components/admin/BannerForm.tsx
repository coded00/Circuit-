"use client";

import { useId, useState } from "react";
import { ImageUploadField, BANNER_BOUNDS } from "@/components/ImageUploadField";
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

// Size rules: BANNER_BOUNDS (src/components/ImageUploadField.tsx) — the
// hero renders full-bleed at a fixed height with an `object-cover`-cropped
// width, so a source that's too small blurs and one that's too square/tall
// loses its subject on wide screens. Checked before an upload is accepted.

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Circuit — create/edit form for a `HomepageBanner`. The image is uploaded
 * (or, as a fallback, linked) through ImageUploadField, which enforces
 * BANNER_BOUNDS client-side before the image can be used.
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
  const [imageBlocked, setImageBlocked] = useState(false);


  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (imageBlocked) return;
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
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${uid}-headline`} className="field-label">Headline</label>
          <input id={`${uid}-headline`} required value={headline} onChange={(e) => setHeadline(e.target.value)} className="field-input" />
        </div>
      </div>
      <ImageUploadField
        label="Banner image"
        purpose="banner"
        required
        value={imageUrl}
        onChange={setImageUrl}
        onValidityChange={setImageBlocked}
        bounds={BANNER_BOUNDS}
      />
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

      {error && <p className="field-error">{error}</p>}

      <div className="flex gap-2">
        <button type="submit" disabled={submitting || imageBlocked} className="btn-primary text-sm">
          {submitting ? "Saving…" : banner ? "Save changes" : "Create banner"}
        </button>
        <button type="button" onClick={onDone} className="btn-ghost text-sm">
          Cancel
        </button>
      </div>
    </form>
  );
}
