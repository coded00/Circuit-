/**
 * Circuit — serves a public uploaded image (see src/lib/uploads.ts).
 * No sign-in required: these are the same avatars/posters/banners anyone
 * browsing the site already sees. The ref itself is signed and
 * unguessable, and only `public-*` uploads can be served from here.
 *
 * `?w=` returns a resized WebP no wider than that (only the widths in
 * lib/imageUrl.ts), so a card never downloads or decodes a 3MB original.
 * Animated GIFs are always served as uploaded.
 *
 * Unauthenticated, and the only route that runs `sharp` on demand, so it is throttled per caller (finding
 * #11 of the security audit). The limit is loose — see PUBLIC_LIMITS in src/lib/rateLimit.ts — because a
 * real page load legitimately asks for dozens of images at once and `immutable` caching means each ref is
 * fetched only once per browser.
 */

import { NextResponse } from "next/server";
import sharp from "sharp";
import { readPublicImage } from "@/lib/uploads";
import { IMAGE_WIDTHS, MAX_IMAGE_PIXELS } from "@/lib/imageUrl";
import { throttlePublicRequest } from "@/lib/rateLimit";

const HEADERS = {
  "X-Content-Type-Options": "nosniff",
  // A ref points at one immutable upload — replacing an image makes a new ref.
  "Cache-Control": "public, max-age=31536000, immutable",
};

export async function GET(request: Request, { params }: { params: Promise<{ ref: string }> }) {
  // Before the ref is even resolved: the point of the limit is to shed the storage read and the `sharp` call
  // below, so there is nothing to gain by doing either first.
  const throttled = await throttlePublicRequest("images", request);
  if (throttled.limited) {
    // Deliberately without HEADERS: that constant carries `Cache-Control: immutable`, and a cached 429 would
    // leave this image broken in that browser for a year.
    return new NextResponse(null, { status: 429, headers: { "Retry-After": String(throttled.retryAfterSeconds) } });
  }

  const { ref } = await params;
  let image: { buffer: Buffer; contentType: string };
  try {
    image = await readPublicImage(ref);
  } catch {
    return NextResponse.json({ error: "Image not found." }, { status: 404 });
  }

  const want = Number(new URL(request.url).searchParams.get("w"));
  const width = IMAGE_WIDTHS.find((w) => w === want);
  if (width && image.contentType !== "image/gif") {
    try {
      const resized = await sharp(image.buffer, { limitInputPixels: MAX_IMAGE_PIXELS }).rotate().resize({ width, withoutEnlargement: true }).webp({ quality: 78 }).toBuffer();
      return new NextResponse(new Uint8Array(resized), { headers: { ...HEADERS, "Content-Type": "image/webp" } });
    } catch {
      // A file sharp can't read falls through to the original.
    }
  }
  return new NextResponse(new Uint8Array(image.buffer), { headers: { ...HEADERS, "Content-Type": image.contentType } });
}
