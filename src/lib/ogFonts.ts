/**
 * Circuit — font loader for `next/og`'s `ImageResponse`. Satori (the
 * engine behind `ImageResponse`) needs real font bytes, not a
 * `next/font` CSS variable — this is the only place in the repo that
 * generates an image rather than a page, so there's no existing pattern
 * to follow.
 *
 * Reads the four font files from `src/assets/fonts/` on disk rather than
 * fetching Google Fonts at request time. That was the first approach
 * here, and it kept failing for reasons that had nothing to do with the
 * code: this sandbox's outbound network gateway intermittently served a
 * bot-detection challenge page instead of real CSS for fonts.googleapis.com
 * (regardless of user-agent), and — separately — the woff2 Google now
 * serves by default crashed this Next.js version's bundled Satori/resvg
 * entirely (an empty server response, not a catchable JS error). Bundling
 * the actual files sidesteps both: no runtime network dependency, no
 * format uncertainty, and it's the same behavior in dev and production.
 *
 * The files themselves (checked into `src/assets/fonts/`): Barlow
 * Condensed ExtraBold and Permanent Marker are genuine .ttf, fetched
 * from Google's own font-source repo (github.com/google/fonts — the
 * actual upstream source for every Google Fonts family, unaffected by
 * the fonts.googleapis.com gateway issue above). The two Inter weights
 * are .woff (v1, not v2) — Satori has always handled woff v1 fine here;
 * it's specifically woff2's brotli compression it can't decode.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";

const FONTS_DIR = path.join(process.cwd(), "src/assets/fonts");

export type OgFont = { name: string; data: ArrayBuffer; weight: 400 | 600 | 800; style: "normal" };

/** The award-headline brush/marker font ("CHAMPION", etc.) — Circuit's
 *  site-wide type system (Barlow Condensed + Inter) has no equivalent, so
 *  this is the one font the share card loads that isn't used anywhere
 *  else in the app. Satori has no font-family fallback chain the way CSS
 *  does — if this fails to load, the caller must pick a different loaded
 *  family by name, not just set this one and hope. */
export const MARKER_FONT_NAME = "Permanent Marker";

const FONT_FILES: { file: string; name: string; weight: OgFont["weight"] }[] = [
  { file: "BarlowCondensed-ExtraBold.ttf", name: "Barlow Condensed", weight: 800 },
  { file: "Inter-SemiBold.woff", name: "Inter", weight: 600 },
  { file: "Inter-Regular.woff", name: "Inter", weight: 400 },
  { file: "PermanentMarker-Regular.ttf", name: MARKER_FONT_NAME, weight: 400 },
];

let cached: Promise<OgFont[]> | null = null;

/** Circuit's own two type families — Barlow Condensed ExtraBold for
 *  names (same weight `--font-display` uses site-wide), Inter for
 *  everything else — plus the marker headline font above. Any file that
 *  fails to read is simply omitted from the result; callers must check
 *  `fonts.some(f => f.name === MARKER_FONT_NAME)` before using it rather
 *  than assuming success. Cached at module scope — these are static
 *  files, read once per server lifetime, not once per request. */
export function loadShareCardFonts(): Promise<OgFont[]> {
  if (!cached) {
    cached = Promise.all(
      FONT_FILES.map(async (f): Promise<OgFont | null> => {
        try {
          const buffer = await readFile(path.join(FONTS_DIR, f.file));
          // `next/og` types `data` as `ArrayBuffer`, not Node's `Buffer` —
          // `.buffer` alone can be a larger pooled allocation than this
          // one file, so slice to this Buffer's own byteOffset/byteLength.
          const data = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
          return { name: f.name, data, weight: f.weight, style: "normal" };
        } catch {
          return null;
        }
      })
    ).then((results) => results.filter((f): f is OgFont => f !== null));
  }
  return cached;
}
