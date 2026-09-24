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
