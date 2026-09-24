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

import { proofStorage, storageKeyOf } from "@/lib/storage";
import { sniffImageType } from "@/lib/imageSniff";

export const PUBLIC_IMAGE_PATH = "/api/images/";
export const MAX_PUBLIC_IMAGE_BYTES = 8 * 1024 * 1024;

/** What each upload is for, and whether only staff may upload it
 *  (banners/game icons are admin-managed content). */
export const IMAGE_PURPOSES = {
  avatar: { staffOnly: false },
  poster: { staffOnly: false },
  banner: { staffOnly: true },
  "game-icon": { staffOnly: true },
} as const;
export type ImagePurpose = keyof typeof IMAGE_PURPOSES;

export function isImagePurpose(value: unknown): value is ImagePurpose {
  return typeof value === "string" && Object.hasOwn(IMAGE_PURPOSES, value);
}

export class UploadError extends Error {}

export async function storePublicImage(purpose: ImagePurpose, buffer: Buffer): Promise<string> {
  if (buffer.length > MAX_PUBLIC_IMAGE_BYTES) throw new UploadError("Images are limited to 8MB.");
  const type = sniffImageType(buffer);
  if (!type) throw new UploadError("Only JPG, PNG, GIF and WebP images can be uploaded.");
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
export async function resolveImageForOg(url: string | null): Promise<string | null> {
  if (!url?.startsWith(PUBLIC_IMAGE_PATH)) return url;
  try {
    const { buffer, contentType } = await readPublicImage(url.slice(PUBLIC_IMAGE_PATH.length));
    return `data:${contentType};base64,${buffer.toString("base64")}`;
  } catch {
    return null;
  }
}
