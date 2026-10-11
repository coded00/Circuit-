/**
 * Circuit Community — finding `@handle` mentions in message text. Pure,
 * no database: the caller resolves candidates against eligible users and
 * keeps only the ones that exist (see resolveMentions in community.ts),
 * so a typed `@nobody` simply stays plain text.
 *
 * Handles follow signup's own rule (3–20 of a-z, 0-9, _). A mention must
 * start the text or follow a character that can't be part of a handle,
 * so email-like text ("me@circuit_gg") isn't read as a mention.
 */

export const MAX_MENTIONS_PER_MESSAGE = 20;

const MENTION_PATTERN = /(^|[^a-z0-9_@])@([a-z0-9_]{3,20})(?![a-z0-9_])/gi;

export type MentionCandidate = {
  /** Lowercased, as stored on User.handle. */
  handle: string;
  /** UTF-16 offset of the "@". */
  start: number;
  /** Length of "@handle". */
  length: number;
};

export function findMentionCandidates(text: string): MentionCandidate[] {
  const found: MentionCandidate[] = [];
  for (const match of text.matchAll(MENTION_PATTERN)) {
    const start = (match.index ?? 0) + match[1].length;
    found.push({ handle: match[2].toLowerCase(), start, length: match[2].length + 1 });
  }
  return found;
}

/** The `@query` being typed right before the caret, if any — drives the
 *  composer's suggestion list. Empty query right after "@" is allowed. */
export function activeMentionQuery(textBeforeCaret: string): { query: string; start: number } | null {
  const match = /(^|[^a-z0-9_@])@([a-z0-9_]{0,20})$/i.exec(textBeforeCaret);
  if (!match) return null;
  return { query: match[2], start: match.index + match[1].length };
}
