"use client";

/**
 * Circuit Community — reactions UI: the chips under a message (emoji +
 * count, highlighted when you're one of the reactors, tap to add/remove
 * yours) and the picker behind "add reaction" (the quick row plus the
 * composer's full emoji set).
 */

import { useState } from "react";
import { SmilePlus } from "lucide-react";
import { EMOJI_CATEGORIES } from "@/lib/emojiData";
import { QUICK_REACTIONS, type ReactionSummary } from "@/lib/communityReactions";

export function ReactionChips({
  reactions,
  onToggle,
  onAdd,
}: {
  reactions: ReactionSummary[];
  onToggle: (emoji: string, on: boolean) => void;
  onAdd: () => void;
}) {
  if (reactions.length === 0) return null;
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1">
      {reactions.map((r) => (
        <button
          key={r.emoji}
          type="button"
          onClick={() => onToggle(r.emoji, !r.reacted)}
          aria-pressed={r.reacted}
          aria-label={`${r.emoji} ${r.count} — ${r.reacted ? "remove your reaction" : "react"}`}
          title={r.names.join(", ") + (r.count > r.names.length ? ` and ${r.count - r.names.length} more` : "")}
          className={`flex h-7 items-center gap-1 rounded-full border px-2 text-[13px] leading-none transition active:scale-95 ${
            r.reacted
              ? "border-accent-volt bg-accent-volt/20 font-semibold text-foreground"
              : "border-border bg-surface-elevated/60 text-muted hover:border-border-hover hover:text-foreground"
          }`}
        >
          <span className="text-[15px]">{r.emoji}</span>
          <span className="font-mono text-[11px] tabular-nums">{r.count}</span>
        </button>
      ))}
      <button
        type="button"
        onClick={onAdd}
        aria-label="Add reaction"
        className="flex h-7 w-8 items-center justify-center rounded-full border border-dashed border-border-strong text-muted transition hover:border-border-hover hover:text-foreground"
      >
        <SmilePlus size={15} />
      </button>
    </div>
  );
}

/** Quick row + categorised grid. Emoji you've already used on this
 *  message are marked, and picking one again removes it. */
export function ReactionPicker({
  reacted,
  onPick,
  compact = false,
}: {
  reacted: Set<string>;
  onPick: (emoji: string) => void;
  /** Desktop popover: smaller grid. */
  compact?: boolean;
}) {
  const [category, setCategory] = useState(EMOJI_CATEGORIES[0].key);
  const emojis = EMOJI_CATEGORIES.find((c) => c.key === category)?.emojis ?? [];

  return (
    <div className="flex flex-col">
      <div className="flex justify-between gap-1 px-3 pt-1 pb-3">
        {QUICK_REACTIONS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            onClick={() => onPick(emoji)}
            aria-label={`React ${emoji}`}
            aria-pressed={reacted.has(emoji)}
            className={`flex aspect-square flex-1 items-center justify-center rounded-full transition active:scale-90 ${
              compact ? "max-w-9 text-[22px]" : "max-w-12 text-[28px]"
            } ${reacted.has(emoji) ? "bg-accent-volt/25 ring-2 ring-accent-volt" : "hover:bg-surface-elevated"}`}
          >
            {emoji}
          </button>
        ))}
      </div>
      <div className="scrollbar-hide flex gap-1 overflow-x-auto border-t border-border px-2 pt-2">
        {EMOJI_CATEGORIES.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => setCategory(c.key)}
            aria-label={c.label}
            className={`shrink-0 rounded-full px-2.5 py-1 text-base transition ${category === c.key ? "bg-surface-elevated" : "opacity-60 hover:opacity-100"}`}
          >
            {c.icon}
          </button>
        ))}
      </div>
      <div className={`scrollbar-hide grid content-start gap-0.5 overflow-y-auto p-2 ${compact ? "h-48 grid-cols-8" : "h-56 grid-cols-8"}`}>
        {emojis.map((emoji) => (
          <button
            key={emoji}
            type="button"
            onClick={() => onPick(emoji)}
            aria-pressed={reacted.has(emoji)}
            className={`flex aspect-square items-center justify-center rounded-lg transition active:scale-90 ${compact ? "text-[20px]" : "text-[24px]"} ${
              reacted.has(emoji) ? "bg-accent-volt/25" : "hover:bg-surface-elevated"
            }`}
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
}
