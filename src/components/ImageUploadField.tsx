"use client";

/**
 * Circuit — image field with real file upload (profile photo, tournament
 * poster, homepage banner, game icon). Uploading is the primary path;
 * pasting a link is kept as a fallback ("Use a link instead"), so older
 * records that already store an external URL keep working and editing.
 *
 * Upload flow: the picked file is prepared in the browser first
 * (prepareImage — downscaled, EXIF/GPS stripped), checked against
 * `bounds` using its *original* resolution, then POSTed to
 * /api/uploads/image, which returns the URL this field hands to
 * `onChange`. Nothing is saved to the record until the surrounding form
 * is submitted, same as before.
 */

import { useId, useRef, useState } from "react";
import { ImagePlus, Link2, Trash2, Upload } from "lucide-react";
import { Spinner } from "@/components/Spinner";
import { ACCEPTED_IMAGE_TYPES, prepareImage } from "@/lib/prepareImage";

export type ImageSizeBounds = {
  minWidth: number;
  minHeight: number;
  minRatio: number;
  maxRatio: number;
  /** Shown as a hint, and folded into the "too wide/thin" error. */
  recommended: string;
};

/**
 * A landscape image that reads well both full-bleed (a hero) and cropped
 * into a narrower 4:3 card via `object-cover` — used by tournament
 * posters and homepage banners alike.
 */
export const POSTER_BOUNDS: ImageSizeBounds = {
  minWidth: 1200,
  minHeight: 300,
  minRatio: 1.5,
  maxRatio: 4,
  recommended: "1600×500px (a landscape banner, roughly 3:1) — used as your tournament's hero image and on its cards.",
};

export const BANNER_BOUNDS: ImageSizeBounds = {
  ...POSTER_BOUNDS,
  recommended: "1600×500px (a landscape banner, roughly 3:1) works best across every screen size.",
};

export type ImagePurpose = "avatar" | "poster" | "banner" | "game-icon";

/** Longest edge an upload is downscaled to, per purpose — big enough for
 *  where each is shown (and above POSTER_BOUNDS' 1200px minimum). */
const MAX_EDGE: Record<ImagePurpose, number> = { avatar: 512, poster: 2400, banner: 2400, "game-icon": 256 };

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

type Status =
  | { state: "uploading" }
  | { state: "ok"; width: number; height: number }
  | { state: "invalid"; message: string };

export function ImageUploadField({
  label,
  value,
  onChange,
  purpose,
  bounds,
  onValidityChange,
  required = false,
  hint,
}: {
  label: string;
  value: string;
  onChange: (url: string) => void;
  purpose: ImagePurpose;
  /** Optional size/shape rules — omitted for avatars and icons. */
  bounds?: ImageSizeBounds;
  /** Called with `true` while the field can't be submitted (an upload in
   *  progress, or the image failing `bounds`/failing to load) — wire it
   *  into the form's submit-disabled state. */
  onValidityChange?: (blocked: boolean) => void;
  required?: boolean;
  hint?: string;
}) {
  const uid = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [linkMode, setLinkMode] = useState(() => value !== "" && !value.startsWith("/api/images/"));
  const [dragging, setDragging] = useState(false);

  function report(next: Status | null) {
    setStatus(next);
    onValidityChange?.(next?.state === "uploading" || next?.state === "invalid");
  }

  async function upload(file: File) {
    report({ state: "uploading" });
    try {
      const prepared = await prepareImage(file, { maxEdge: MAX_EDGE[purpose] });
      URL.revokeObjectURL(prepared.previewUrl);
      const problem = bounds ? checkImageSize(prepared.originalWidth, prepared.originalHeight, bounds) : null;
      if (problem) {
        report({ state: "invalid", message: problem });
        return;
      }

      const form = new FormData();
      form.append("file", prepared.blob);
      form.append("purpose", purpose);
      const res = await fetch("/api/uploads/image", { method: "POST", body: form });
      const data = await res.json().catch(() => null);
      if (!res.ok || typeof data?.url !== "string") {
        report({ state: "invalid", message: data?.error ?? "Upload failed. Try again." });
        return;
      }
      onChange(data.url);
      report({ state: "ok", width: prepared.originalWidth, height: prepared.originalHeight });
    } catch (err) {
      report({ state: "invalid", message: err instanceof Error ? err.message : "Upload failed. Try again." });
    }
  }

  // Dimension check for a pasted link or an existing value, once the
  // preview actually loads (a URL string alone can't be measured).
  function handlePreviewLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    if (status?.state === "uploading" || status?.state === "ok") return;
    const { naturalWidth: width, naturalHeight: height } = e.currentTarget;
    const problem = bounds ? checkImageSize(width, height, bounds) : null;
    report(problem ? { state: "invalid", message: problem } : linkMode ? { state: "ok", width, height } : null);
  }

  function handlePreviewError() {
    report({ state: "invalid", message: linkMode ? "Couldn't load an image from that link." : "Couldn't load this image." });
  }

  function clear() {
    onChange("");
    report(null);
  }

  const uploading = status?.state === "uploading";
  const previewClass =
    purpose === "avatar"
      ? "h-20 w-20 rounded-full"
      : purpose === "game-icon"
        ? "h-20 w-20 rounded-[12px]"
        : "h-32 w-full rounded-[10px]";

  return (
    <div className="relative flex flex-col gap-1.5">
      <span className="field-label" id={`${uid}-label`}>
        {label}
      </span>

      {linkMode ? (
        <input
          aria-labelledby={`${uid}-label`}
          type="url"
          required={required}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            report(null);
          }}
          placeholder="https://…"
          className="field-input"
        />
      ) : (
        <>
          <input
            ref={fileRef}
            type="file"
            accept={ACCEPTED_IMAGE_TYPES}
            className="hidden"
            aria-labelledby={`${uid}-label`}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) upload(file);
            }}
          />
          {/* Keeps `required` enforceable for the file path too: the form's
              native validation checks this hidden-but-focusable input. */}
          {required && (
            <input
              tabIndex={-1}
              aria-hidden
              required
              value={value}
              onChange={() => {}}
              className="pointer-events-none absolute h-px w-px opacity-0"
            />
          )}
          {!value && (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                const file = e.dataTransfer.files?.[0];
                if (file) upload(file);
              }}
              className={`flex flex-col items-center justify-center gap-1.5 rounded-[10px] border border-dashed px-4 py-6 text-sm transition ${
                dragging ? "border-accent-blue bg-accent-blue-soft" : "border-border-strong hover:bg-surface-elevated"
              }`}
            >
              {uploading ? <Spinner size={20} className="text-muted" /> : <ImagePlus size={22} className="text-muted" />}
              <span className="font-medium">{uploading ? "Uploading…" : "Upload an image"}</span>
              <span className="text-metadata">JPG, PNG, GIF or WebP · up to 8MB · or drag it here</span>
            </button>
          )}
        </>
      )}

      <span className="field-hint">{hint ?? (bounds ? `Recommended size: ${bounds.recommended}` : "")}</span>

      {value && (
        <div className="flex flex-col gap-1.5">
          <div className={`flex items-center gap-3 ${purpose === "avatar" || purpose === "game-icon" ? "" : "flex-col items-stretch"}`}>
            <div className={`relative shrink-0 overflow-hidden border border-border bg-surface-elevated ${previewClass}`}>
              {/* eslint-disable-next-line @next/next/no-img-element -- upload/pasted-link preview; dimensions read via onLoad */}
              <img src={value} alt="" className="h-full w-full object-cover" onLoad={handlePreviewLoad} onError={handlePreviewError} />
              {uploading && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                  <Spinner size={20} className="text-white" />
                </div>
              )}
            </div>
            {!linkMode && (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="btn-secondary flex items-center gap-1.5 text-sm"
                >
                  <Upload size={14} /> Replace
                </button>
                <button type="button" onClick={clear} disabled={uploading} className="btn-secondary flex items-center gap-1.5 text-sm">
                  <Trash2 size={14} /> Remove
                </button>
              </div>
            )}
          </div>
          {status?.state === "ok" && (
            <span className="text-xs text-success">
              ✓ {status.width}×{status.height}px — good to use.
            </span>
          )}
        </div>
      )}

      {status?.state === "invalid" && <p className="field-error">{status.message}</p>}

      <button
        type="button"
        onClick={() => {
          setLinkMode(!linkMode);
          report(null);
        }}
        className="flex items-center gap-1.5 self-start text-xs font-medium text-muted transition hover:text-foreground"
      >
        {linkMode ? <Upload size={12} /> : <Link2 size={12} />}
        {linkMode ? "Upload a file instead" : "Use a link instead"}
      </button>
    </div>
  );
}
