/**
 * Circuit — public image uploads (profile photos, tournament posters,
 * homepage banners, game icons). Replaces "paste an image URL" for those
 * fields while keeping the same stored shape: the DB column still holds a
 * URL string, now a site-relative `/api/images/<ref>` path for an
 * upload, so every existing read site renders it unchanged and older
 * pasted URLs keep working.
 *
 * Bytes go through the same ProofStorage (local disk in dev, R2/S3 when
 * configured) as match proof, under a `public-<purpose>` key. The public
 * image route only serves refs under that prefix — a signed ref for
 * proof/evidence/chat can't be replayed through it.
 */

import sharp from "sharp";
import { proofStorage, storageKeyOf } from "@/lib/storage";
import { sniffImageType } from "@/lib/imageSniff";
import { MAX_IMAGE_PIXELS } from "@/lib/imageUrl";

export const PUBLIC_IMAGE_PATH = "/api/images/";
/** Our own cap, applied to `file.size` before anything is read into memory — not a platform's.
 *  It used to say it was "kept under Vercel's 4.5MB request-body limit, which rejects larger uploads
 *  before this code runs", which is only true on Vercel; this repo also ships a self-hosted Docker
 *  deployment, where nothing upstream refuses a body. See the declared-length check in
 *  src/app/api/uploads/image for the part that runs before the body is buffered. */
export const MAX_PUBLIC_IMAGE_BYTES = 4 * 1024 * 1024;

/** What each upload is for, and whether only staff may upload it
 *  (banners/game icons are admin-managed content). */
export const IMAGE_PURPOSES = {
  avatar: { staffOnly: false },
  poster: { staffOnly: false },
  listing: { staffOnly: false },
  "community-icon": { staffOnly: false },
  "community-banner": { staffOnly: false },
  banner: { staffOnly: true },
  "game-icon": { staffOnly: true },
  "game-cover": { staffOnly: true },
} as const;
export type ImagePurpose = keyof typeof IMAGE_PURPOSES;

export function isImagePurpose(value: unknown): value is ImagePurpose {
  return typeof value === "string" && Object.hasOwn(IMAGE_PURPOSES, value);
}

export class UploadError extends Error {}

export async function storePublicImage(purpose: ImagePurpose, buffer: Buffer): Promise<string> {
  if (buffer.length > MAX_PUBLIC_IMAGE_BYTES) throw new UploadError("Images are limited to 4MB.");
  const type = sniffImageType(buffer);
  if (!type) throw new UploadError("Only JPG, PNG, GIF and WebP images can be uploaded.");

  // Bytes bound the file; they don't bound what it costs to decode. A ~4MB PNG can declare a hundred
  // million pixels and still pass the check above, and nothing downstream re-checks: the share-card
  // renderer inlines an upload's bytes straight into next/og, which hands them to Satori to decode with
  // no pixel cap at all, on unauthenticated routes. `metadata()` reads only the header — it doesn't
  // decode the pixels — and sharp refuses outright when the header declares more than the budget, so
  // this costs one small parse at upload time and removes the amplification from every later render.
  const meta = await sharp(buffer, { limitInputPixels: MAX_IMAGE_PIXELS })
    .metadata()
    .catch(() => null);
  if (!meta) {
    // Either the header declares more than MAX_IMAGE_PIXELS (sharp's own refusal) or there is no readable
    // header at all. Both are "we can't use this", and the first is by far the likelier with a real file.
    throw new UploadError(`That image is too large or couldn't be read. Images are limited to ${MAX_IMAGE_PIXELS / 1_000_000} megapixels.`);
  }
  if (!meta.width || !meta.height) throw new UploadError("That image couldn't be read.");

  const ref = await proofStorage.store(`public-${purpose}`, buffer, type);
  return `${PUBLIC_IMAGE_PATH}${ref}`;
}

/** Throws for a malformed/tampered ref, or one that isn't a public upload. */
export async function readPublicImage(ref: string): Promise<{ buffer: Buffer; contentType: string }> {
  if (!storageKeyOf(ref).startsWith("public-")) throw new UploadError("Not a public image.");
  return proofStorage.read(ref);
}

/**
 * next/og (share cards) fetches <img src> itself and can't resolve a
 * site-relative path, so an uploaded image is inlined as a data URI read
 * straight from storage; an external URL passes through unchanged.
 * Returns null if an upload can't be read, so the card falls back to its
 * no-image look rather than failing to render.
 */
// next/og fetches an image URL from the server. An arbitrary user-set avatar or poster URL would let
// anyone make this server request internal addresses (a metadata service, localhost), so only https
// URLs on these hosts pass through; everything else renders the card without that image.
const TRUSTED_IMAGE_HOSTS = new Set(["lh3.googleusercontent.com", "i.ytimg.com"]);
function isTrustedImageHost(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && !u.port && TRUSTED_IMAGE_HOSTS.has(u.hostname);
  } catch {
    return false;
  }
}

export async function resolveImageForOg(url: string | null): Promise<string | null> {
  if (!url) return url;
  if (!url.startsWith(PUBLIC_IMAGE_PATH)) return isTrustedImageHost(url) ? url : null;
  try {
    const { buffer, contentType } = await readPublicImage(url.slice(PUBLIC_IMAGE_PATH.length));
    // next/og throws on WebP (it would crash the whole card). Uploads are
    // encoded as JPEG/PNG for exactly this reason, but a WebP could still
    // arrive from a client that skipped prepareImage — degrade, don't crash.
    if (contentType === "image/webp") return null;
    return `data:${contentType};base64,${buffer.toString("base64")}`;
  } catch {
    return null;
  }
}
