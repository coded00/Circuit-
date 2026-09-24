/**
 * Circuit — serves a public uploaded image (see src/lib/uploads.ts).
 * No sign-in required: these are the same avatars/posters/banners anyone
 * browsing the site already sees. The ref itself is signed and
 * unguessable, and only `public-*` uploads can be served from here.
 */

import { NextResponse } from "next/server";
import { readPublicImage } from "@/lib/uploads";

export async function GET(_request: Request, { params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  let image: { buffer: Buffer; contentType: string };
  try {
    image = await readPublicImage(ref);
  } catch {
    return NextResponse.json({ error: "Image not found." }, { status: 404 });
  }
  return new NextResponse(new Uint8Array(image.buffer), {
    headers: {
      "Content-Type": image.contentType,
      "X-Content-Type-Options": "nosniff",
      // A ref points at one immutable upload — replacing an image makes a new ref.
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
