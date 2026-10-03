/**
 * Circuit — right-sized images. Uploads are stored at full size (a cover can be
 * 3MB), but a card or avatar only needs a few hundred pixels. `sized` asks the
 * image route for a resized, compressed copy of an uploaded image; anything else
 * (an external URL) comes back unchanged. The route only honours these widths.
 */

export const IMAGE_WIDTHS = [96, 160, 240, 320, 480, 640, 960, 1280, 1600] as const;

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
