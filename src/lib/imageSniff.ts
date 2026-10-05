/**
 * Circuit — identifies an uploaded image's real format from its first
 * bytes rather than trusting the browser-sent Content-Type. Whatever this
 * returns is the type an upload is later *served* as, so it must only
 * ever be one of these four raster formats — never SVG (it can carry
 * script) and never anything unrecognised.
 */

export type SniffedImageType = "image/png" | "image/jpeg" | "image/gif" | "image/webp";

export function sniffImageType(buffer: Buffer): SniffedImageType | null {
  if (buffer.length < 12) return null;
  if (buffer[0] === 0x89 && buffer.toString("ascii", 1, 4) === "PNG") return "image/png";
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  const head = buffer.toString("ascii", 0, 6);
  if (head === "GIF87a" || head === "GIF89a") return "image/gif";
  if (buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return null;
}

export type SniffedProofType = SniffedImageType | "video/mp4" | "video/quicktime" | "video/webm";

/**
 * Match proof and report evidence may be a screenshot or a short clip. Same rule as images:
 * the type comes from the file's own bytes, never from the browser-sent Content-Type, and
 * anything unrecognised (HTML, SVG, scripts, executables) is refused.
 */
export function sniffProofType(buffer: Buffer): SniffedProofType | null {
  const image = sniffImageType(buffer);
  if (image) return image;
  if (buffer.length < 12) return null;
  // ISO base media (MP4 / MOV): "ftyp" at byte 4, brand after it.
  if (buffer.toString("ascii", 4, 8) === "ftyp") return buffer.toString("ascii", 8, 10) === "qt" ? "video/quicktime" : "video/mp4";
  // Matroska / WebM: EBML header.
  if (buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3) return "video/webm";
  return null;
}

export const PROOF_TYPE_ERROR = "Proof must be a screenshot (PNG, JPEG, GIF or WebP) or a short clip (MP4, MOV or WebM).";
