/**
 * Circuit — right-sized images. Uploads are stored at full size (a cover can be
 * 3MB), but a card or avatar only needs a few hundred pixels. `sized` asks the
 * image route for a resized, compressed copy of an uploaded image; anything else
 * (an external URL) comes back unchanged. The route only honours these widths.
 */

export const IMAGE_WIDTHS = [96, 160, 240, 320, 480, 640, 960, 1280, 1600] as const;

/**
 * The most pixels one image may have. Enforced in two places that have to
 * agree: the upload check (src/lib/uploads.ts) and the resize route
 * (src/app/api/images/[ref]). Both used to carry their own answer — the
 * resizer capped at 40 megapixels while the uploader capped nothing at all,
 * so an upload could pass and then be decoded by whichever consumer forgot
 * to check. Kept here, in a module with no server-only imports, so the
 * client can read it too.
 *
 * 40MP is roughly 7x the largest thing the upload UI produces (a poster is
 * downscaled to 2400px on its long edge before it leaves the browser), so it
 * only rejects a client that skipped that step — which is the client whose
 * file nothing else bounds.
 */
export const MAX_IMAGE_PIXELS = 40_000_000;

const UPLOAD_PREFIX = "/api/images/";

/** The smallest allowed width that is at least `want`. */
export function bucketWidth(want: number): number {
  return IMAGE_WIDTHS.find((w) => w >= want) ?? IMAGE_WIDTHS[IMAGE_WIDTHS.length - 1];
}

/** `want` is the width the image is shown at in CSS pixels; this asks for 1.5x of it, to stay sharp on dense screens. */
export function sized(url: string | null | undefined, want: number): string | null {
  if (!url) return null;
  if (!url.startsWith(UPLOAD_PREFIX) || url.includes("?")) return url;
  return `${url}?w=${bucketWidth(Math.ceil(want * 1.5))}`;
}
