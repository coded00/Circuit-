/**
 * Circuit — serves a public uploaded image (see src/lib/uploads.ts).
 * No sign-in required: these are the same avatars/posters/banners anyone
 * browsing the site already sees. The ref itself is signed and
 * unguessable, and only `public-*` uploads can be served from here.
 *
 * `?w=` returns a resized WebP no wider than that (only the widths in
 * lib/imageUrl.ts), so a card never downloads or decodes a 3MB original.
 * Animated GIFs are always served as uploaded.
 */

import { NextResponse } from "next/server";
import sharp from "sharp";
import { readPublicImage } from "@/lib/uploads";
import { IMAGE_WIDTHS, MAX_IMAGE_PIXELS } from "@/lib/imageUrl";

const HEADERS = {
  "X-Content-Type-Options": "nosniff",
  // A ref points at one immutable upload — replacing an image makes a new ref.
  "Cache-Control": "public, max-age=31536000, immutable",
};

export async function GET(request: Request, { params }: { params: Promise<{ ref: string }> }) {
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
