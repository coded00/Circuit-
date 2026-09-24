/**
 * Circuit Community — the built-in sticker set. Deliberately drawn from
 * Circuit's own design tokens (CSS, no image files): there's no licensed
 * third-party sticker art in this codebase, and a small, on-brand set of
 * gaming callouts reads better in a competitive chat than a generic pack.
 *
 * Shared by the server (sendMessage only accepts an id listed here) and
 * the client (picker + renderer), so the two can never disagree about
 * what a stickerId means. Never remove or rename an id once shipped —
 * old messages still reference it; retire one by moving it to RETIRED.
 */

export type StickerTone = "volt" | "orange" | "blue" | "live" | "gold" | "dark";

export type Sticker = {
  id: string;
  /** Big text on the sticker itself. */
  label: string;
  /** Small emoji accent in the corner. */
  emoji: string;
  tone: StickerTone;
};

export const STICKERS: Sticker[] = [
  { id: "gg", label: "GG", emoji: "🤝", tone: "volt" },
  { id: "w", label: "W", emoji: "🏆", tone: "gold" },
  { id: "l", label: "L", emoji: "💀", tone: "dark" },
  { id: "clutch", label: "CLUTCH", emoji: "🔥", tone: "orange" },
  { id: "ez", label: "EZ", emoji: "😎", tone: "blue" },
  { id: "lets-go", label: "LET'S GO", emoji: "🚀", tone: "volt" },
  { id: "rematch", label: "REMATCH?", emoji: "⚔️", tone: "orange" },
  { id: "no-scope", label: "NO SCOPE", emoji: "🎯", tone: "live" },
  { id: "one-more", label: "ONE MORE", emoji: "🎮", tone: "blue" },
  { id: "goat", label: "GOAT", emoji: "🐐", tone: "gold" },
  { id: "lag", label: "LAG!!", emoji: "📶", tone: "live" },
  { id: "who-next", label: "WHO NEXT", emoji: "👀", tone: "dark" },
];

/** Ids that must still render for old messages but aren't offered in the picker. */
const RETIRED: Sticker[] = [];

const BY_ID = new Map([...STICKERS, ...RETIRED].map((s) => [s.id, s]));

export function getSticker(id: string | null | undefined): Sticker | null {
  return id ? (BY_ID.get(id) ?? null) : null;
}

/** Only stickers currently offered can be sent. */
export function isSendableSticker(id: string): boolean {
  return STICKERS.some((s) => s.id === id);
}
