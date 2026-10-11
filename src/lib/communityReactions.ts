/**
 * Circuit Community — which emoji can be used as a reaction, and how a
 * message's reaction rows collapse into what the client shows.
 *
 * The allowed set is the quick-reaction row plus the composer's own
 * curated emoji picker (src/lib/emojiData.ts) — validated server-side so
 * reactions can't carry arbitrary strings.
 */

import { EMOJI_CATEGORIES } from "@/lib/emojiData";

/** One-tap row, shown first in every reaction picker. */
export const QUICK_REACTIONS = ["❤️", "🔥", "😂", "👍", "😮", "😢", "🏆", "💯"] as const;

/** Distinct emoji a single message can collect. */
export const MAX_REACTION_TYPES_PER_MESSAGE = 20;

const ALLOWED = new Set<string>([...QUICK_REACTIONS, ...EMOJI_CATEGORIES.flatMap((c) => c.emojis)]);

export function isAllowedReaction(emoji: unknown): emoji is string {
  return typeof emoji === "string" && ALLOWED.has(emoji);
}

export type ReactionSummary = {
  emoji: string;
  count: number;
  /** Whether the viewer is one of the reactors. */
  reacted: boolean;
  /** Up to a few reactor names, for the chip's tooltip. */
  names: string[];
};

const NAMES_SHOWN = 8;

/** Groups rows by emoji, in the order each emoji was first used. */
export function summarizeReactions(
  rows: { emoji: string; userId: string; createdAt: Date; user: { displayName: string } }[],
  viewerId: string
): ReactionSummary[] {
  const byEmoji = new Map<string, ReactionSummary & { first: number }>();
  for (const row of [...rows].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())) {
    let entry = byEmoji.get(row.emoji);
    if (!entry) {
      entry = { emoji: row.emoji, count: 0, reacted: false, names: [], first: row.createdAt.getTime() };
      byEmoji.set(row.emoji, entry);
    }
    entry.count += 1;
    if (row.userId === viewerId) entry.reacted = true;
    if (entry.names.length < NAMES_SHOWN) entry.names.push(row.userId === viewerId ? "You" : row.user.displayName);
  }
  return [...byEmoji.values()].sort((a, b) => a.first - b.first).map(({ first: _first, ...rest }) => rest);
}
