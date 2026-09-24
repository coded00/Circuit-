/**
 * Circuit — client-side image preparation before any upload (chat
 * images, profile photos, posters, banners). Decodes the file, applies
 * its EXIF rotation, downscales it to `maxEdge` and re-encodes it. That
 * keeps a 12MB phone photo to a few hundred KB and — just as important —
 * strips its EXIF metadata (GPS location included) before it ever leaves
 * the device. GIFs pass through untouched so they stay animated.
 *
 * Browser-only (canvas, createImageBitmap) — call from client components.
 */

/** Mirrors the server-side 8MB caps (MAX_CHAT_IMAGE_BYTES / MAX_PUBLIC_IMAGE_BYTES). */
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
export const ACCEPTED_IMAGE_TYPES = "image/png,image/jpeg,image/gif,image/webp";

export type PreparedImage = {
  blob: Blob;
  /** Output size, after downscaling. */
  width: number;
  height: number;
  /** The file's size before downscaling — what dimension checks (e.g. a
   *  poster's minimum resolution) should be judged against. */
  originalWidth: number;
  originalHeight: number;
  /** Object URL for a local preview; revoke it when done. */
  previewUrl: string;
};

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

function measureImage(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error("decode"));
    img.src = url;
  });
}

export async function prepareImage(file: File, { maxEdge }: { maxEdge: number }): Promise<PreparedImage> {
  if (!ACCEPTED_IMAGE_TYPES.split(",").includes(file.type)) {
    throw new Error("Only JPG, PNG, GIF and WebP images can be uploaded.");
  }

  if (file.type === "image/gif") {
    if (file.size > MAX_UPLOAD_BYTES) throw new Error("GIFs are limited to 8MB.");
    const previewUrl = URL.createObjectURL(file);
    const { width, height } = await measureImage(previewUrl).catch(() => {
      URL.revokeObjectURL(previewUrl);
      throw new Error("That GIF couldn't be opened.");
    });
    return { blob: file, width, height, originalWidth: width, originalHeight: height, previewUrl };
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("That image couldn't be opened. Try a JPG or PNG.");
  }
  const originalWidth = bitmap.width;
  const originalHeight = bitmap.height;
  const scale = Math.min(1, maxEdge / Math.max(originalWidth, originalHeight));
  const width = Math.round(originalWidth * scale);
  const height = Math.round(originalHeight * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  // WebP keeps transparency at a small size; browsers that can't encode
  // it hand back a PNG instead, in which case fall back to JPEG for
  // photos (PNG sources stay PNG so transparency survives).
  let blob = await canvasToBlob(canvas, "image/webp", 0.85);
  if (!blob || blob.type !== "image/webp") {
    blob = await canvasToBlob(canvas, file.type === "image/png" ? "image/png" : "image/jpeg", 0.85);
  }
  if (!blob) throw new Error("That image couldn't be processed.");
  if (blob.size > MAX_UPLOAD_BYTES) throw new Error("That image is too large to upload.");
  return { blob, width, height, originalWidth, originalHeight, previewUrl: URL.createObjectURL(blob) };
}
