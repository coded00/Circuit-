"use client";

import { useId, useState } from "react";

export type ImageSizeBounds = {
  minWidth: number;
  minHeight: number;
  minRatio: number;
  maxRatio: number;
  /** Shown as a hint, and folded into the "too wide/thin" error. */
  recommended: string;
};

/**
 * Same bounds already proven out for the homepage banner (see
 * BannerForm.tsx) — a landscape image that reads well both full-bleed
 * (a hero) and cropped into a narrower 4:3 card via `object-cover`.
 * Reused here for tournament posters since it's the identical
 * "one upload, several aspect ratios via object-cover" situation.
 */
export const POSTER_BOUNDS: ImageSizeBounds = {
  minWidth: 1200,
  minHeight: 300,
  minRatio: 1.5,
  maxRatio: 4,
  recommended: "1600×500px (a landscape banner, roughly 3:1) — used as your tournament's hero image and on its cards.",
};

function checkImageSize(width: number, height: number, bounds: ImageSizeBounds): string | null {
  if (width < bounds.minWidth || height < bounds.minHeight) {
    return `Too small (${width}×${height}px) — needs at least ${bounds.minWidth}×${bounds.minHeight}px so it doesn't blur when stretched.`;
  }
  const ratio = width / height;
  if (ratio < bounds.minRatio) {
    return `Too narrow/tall (${width}×${height}px, ${ratio.toFixed(1)}:1) — this crops away most of the image on wide screens. Use a landscape image.`;
  }
  if (ratio > bounds.maxRatio) {
    return `Too wide/thin (${width}×${height}px, ${ratio.toFixed(1)}:1) — this crops away too much on narrow screens. ${bounds.recommended}`;
  }
  return null;
}

type ImageStatus =
  | { state: "checking" }
  | { state: "ok"; width: number; height: number }
  | { state: "invalid"; message: string };

/**
 * A pasted-URL image field with real, client-side dimension validation —
 * the image actually loads in the browser and its real naturalWidth/
 * naturalHeight get checked against `bounds`, same as BannerForm's own
 * inline version. Extracted here since tournament posters need the exact
 * same check as the homepage banner did; that one wasn't touched since
 * it wasn't part of this request, but new callers use this instead of
 * re-duplicating the logic a third time.
 */
export function ImageUrlField({
  label,
  value,
  onChange,
  bounds,
  onValidityChange,
  required = false,
  hint,
}: {
  label: string;
  value: string;
  onChange: (url: string) => void;
  bounds: ImageSizeBounds;
  /** Called with `true` while the current value fails the size check (or
   *  fails to load) — wire this into the form's own submit-disabled
   *  state, same as BannerForm's `blockedBySize`. */
  onValidityChange?: (blocked: boolean) => void;
  required?: boolean;
  /** Overrides the default "Recommended size: ..." hint text. */
  hint?: string;
}) {
  const uid = useId();
  const [status, setStatus] = useState<ImageStatus | null>(null);

  function handleLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    const { naturalWidth: width, naturalHeight: height } = e.currentTarget;
    const problem = checkImageSize(width, height, bounds);
    const next: ImageStatus = problem ? { state: "invalid", message: problem } : { state: "ok", width, height };
    setStatus(next);
    onValidityChange?.(next.state === "invalid");
  }

  function handleError() {
    setStatus({ state: "invalid", message: "Couldn't load an image from that URL." });
    onValidityChange?.(true);
  }

  function handleChange(url: string) {
    onChange(url);
    setStatus(url ? { state: "checking" } : null);
    onValidityChange?.(false);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={`${uid}-img`} className="field-label">
        {label}
      </label>
      <input
        id={`${uid}-img`}
        type="url"
        required={required}
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        placeholder="https://…"
        className="field-input"
      />
      <span className="field-hint">{hint ?? `Recommended size: ${bounds.recommended}`}</span>

      {value && (
        <div className="flex flex-col gap-1.5">
          <div className="relative h-32 w-full overflow-hidden rounded-[10px] border border-border">
            {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary user-pasted preview URL, dimensions read via onLoad below */}
            <img src={value} alt="" className="h-full w-full object-cover" onLoad={handleLoad} onError={handleError} />
          </div>
          {status?.state === "ok" && (
            <span className="text-xs text-success">
              ✓ {status.width}×{status.height}px — good to use.
            </span>
          )}
          {status?.state === "invalid" && <p className="field-error">{status.message}</p>}
        </div>
      )}
    </div>
  );
}
