/**
 * Serves a stored proof or evidence file. These live on the app's own origin, so a file
 * served as text/html (or SVG) would run its script with the viewer's session. The stored
 * content type is only honoured if it is a known image or video type; anything else (including
 * files stored before uploads were checked) is sent as an opaque download. The CSP sandbox and
 * nosniff mean even a mislabelled file cannot run script in the page's origin.
 */
import { NextResponse } from "next/server";

const SAFE_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "video/mp4", "video/quicktime", "video/webm"]);

export function proofResponse(buffer: Buffer, contentType: string): NextResponse {
  const safe = SAFE_TYPES.has(contentType);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": safe ? contentType : "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox; default-src 'none'",
      "Cache-Control": "private, no-store",
      ...(safe ? {} : { "Content-Disposition": "attachment" }),
    },
  });
}
