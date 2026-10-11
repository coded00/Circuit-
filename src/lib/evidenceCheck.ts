/**
 * Circuit — advisory checks on a submitted screenshot's own metadata (docs/daily-challenges-spec.md §11, verification).
 *
 * A photo or screenshot can carry the time it was taken. When it does, that time should fall inside the challenge — after
 * the match window opened and no later than the deadline for submitting — so a scoreboard from last week, or one saved
 * from someone else, stands out. These are flags for the reviewer to weigh, never a verdict: plenty of screenshots carry
 * no metadata at all (most phones' screenshot tools write none), and metadata can be edited. Nothing here rejects a
 * submission or touches a prize.
 */

import exifr from "exifr";

export const EVIDENCE_FLAGS = ["BEFORE_WINDOW", "AFTER_DEADLINE", "FROM_THE_FUTURE", "EDITING_SOFTWARE", "NO_TIMESTAMP"] as const;
export type EvidenceFlag = (typeof EVIDENCE_FLAGS)[number];

export const EVIDENCE_FLAG_TEXT: Record<EvidenceFlag, { tone: "warn" | "info"; text: string }> = {
  BEFORE_WINDOW: { tone: "warn", text: "The screenshot says it was taken before the match window opened." },
  AFTER_DEADLINE: { tone: "warn", text: "The screenshot says it was taken after submissions closed." },
  FROM_THE_FUTURE: { tone: "warn", text: "The screenshot's timestamp is later than the moment it was uploaded." },
  EDITING_SOFTWARE: { tone: "warn", text: "The file was last saved by an image editor." },
  NO_TIMESTAMP: { tone: "info", text: "No capture time in the file, so it can't be checked. Most phone screenshots are like this." },
};

/** Clocks drift and a match can end a little after the window does. */
export const TOLERANCE_MS = 10 * 60_000;
/** Camera clocks carry no timezone unless the phone writes an offset; Circuit's players are in Lagos. */
const LAGOS_OFFSET = "+01:00";
const EDITORS = /photoshop|gimp|canva|lightroom|snapseed|picsart|pixlr|paint\.net|affinity|facetune/i;

export type EvidenceMeta = { capturedAt: Date | null; software: string | null };

/** "2026:10:11 12:30:00" (+ optional "+01:00") → a Date; null if it isn't a real time. */
export function parseExifTime(raw: unknown, offset?: unknown): Date | null {
  if (typeof raw !== "string") return null;
  const m = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(raw.trim());
  if (!m) return null;
  const off = typeof offset === "string" && /^[+-]\d{2}:\d{2}$/.test(offset.trim()) ? offset.trim() : LAGOS_OFFSET;
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}${off}`);
  return Number.isNaN(d.getTime()) || d.getUTCFullYear() < 2000 ? null : d;
}

/** Reads the capture time and editing software from an image. Never throws: a file we can't read just has no metadata. */
export async function readEvidenceMeta(buffer: Buffer): Promise<EvidenceMeta> {
  try {
    const tags = (await exifr.parse(buffer, { pick: ["DateTimeOriginal", "CreateDate", "OffsetTimeOriginal", "OffsetTimeDigitized", "OffsetTime", "Software"], reviveValues: false })) as Record<string, unknown> | undefined;
    if (!tags) return { capturedAt: null, software: null };
    const capturedAt = parseExifTime(tags.DateTimeOriginal ?? tags.CreateDate, tags.OffsetTimeOriginal ?? tags.OffsetTimeDigitized ?? tags.OffsetTime);
    return { capturedAt, software: typeof tags.Software === "string" ? tags.Software : null };
  } catch {
    return { capturedAt: null, software: null };
  }
}

export function evidenceFlags(meta: EvidenceMeta, win: { windowStartsAt: Date; submissionsCloseAt: Date; uploadedAt: Date }): EvidenceFlag[] {
  const flags: EvidenceFlag[] = [];
  if (meta.capturedAt) {
    const t = meta.capturedAt.getTime();
    if (t < win.windowStartsAt.getTime() - TOLERANCE_MS) flags.push("BEFORE_WINDOW");
    if (t > win.submissionsCloseAt.getTime() + TOLERANCE_MS) flags.push("AFTER_DEADLINE");
    if (t > win.uploadedAt.getTime() + TOLERANCE_MS) flags.push("FROM_THE_FUTURE");
  } else {
    flags.push("NO_TIMESTAMP");
  }
  if (meta.software && EDITORS.test(meta.software)) flags.push("EDITING_SOFTWARE");
  return flags;
}

/** Pulls the likeliest result number out of OCR text from a scoreboard: the number that sits next to a label for the stat. */
export function guessScoreFromText(text: string, labels: readonly string[]): number | null {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const wanted = labels.map((l) => l.toLowerCase()).filter((l) => l.length >= 3);
  for (const line of lines) {
    const lower = line.toLowerCase();
    if (!wanted.some((w) => lower.includes(w))) continue;
    const nums = line.match(/\d{1,5}/g);
    if (nums && nums.length === 1) return Number(nums[0]);
  }
  return null;
}
