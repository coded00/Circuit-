"use client";

/**
 * Circuit Community — one message row: content, reaction chips, and the
 * ways to react.
 *
 * - Pointer devices: a small toolbar appears on hover (three quick
 *   reactions + the full picker in a popover).
 * - Touch: long-press the message to open the reaction sheet (the
 *   tap that follows is swallowed, so long-pressing an image doesn't also
 *   open the image viewer).
 * - Anywhere: tap a chip to add/remove your reaction; "+" opens the picker.
 *
 * The popover is portaled and fixed-positioned against the viewport,
 * flipping above the toolbar near the bottom, so the chat's scroll box
 * can never clip it.
 */

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { SmilePlus } from "lucide-react";
import type { ReactionSummary } from "@/lib/communityReactions";
import { DialogOverlay, useIsDesktop, useMounted } from "@/components/ui/Overlay";
import { MessageBody, type MessageContent } from "./MessageBody";
import { ReactionChips, ReactionPicker } from "./MessageReactions";

const LONG_PRESS_MS = 450;
const TOOLBAR_QUICK = ["❤️", "🔥", "😂"];
const POPOVER_WIDTH = 320;
const POPOVER_HEIGHT = 330;

export type RowMessage = MessageContent & { id: string; reactions: ReactionSummary[] };

function PickerPopover({ anchor, onClose, children }: { anchor: DOMRect; onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const below = window.innerHeight - anchor.bottom > POPOVER_HEIGHT + 12;
  const top = below ? anchor.bottom + 6 : Math.max(8, anchor.top - POPOVER_HEIGHT - 6);
  const left = Math.min(Math.max(8, anchor.right - POPOVER_WIDTH), window.innerWidth - POPOVER_WIDTH - 8);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    // Scrolling the chat would leave a fixed popover floating over the wrong message.
    function onScroll(e: Event) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [onClose]);

  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-label="Add reaction"
      className="fixed z-50 overflow-hidden rounded-[14px] border border-border bg-surface pt-3"
      style={{ top, left, width: POPOVER_WIDTH, boxShadow: "var(--shadow-float)" }}
    >
      {children}
    </div>,
    document.body
  );
}

export function MessageRow({
  message,
  viewerId,
  leading,
  header,
  highlighted,
  onReact,
}: {
  message: RowMessage;
  viewerId: string;
  /** Avatar for the first message of a group, a spacer after it. */
  leading: React.ReactNode;
  /** Name + time for the first message of a group. */
  header?: React.ReactNode;
  /** Deep-linked from a notification — flashes briefly. */
  highlighted?: boolean;
  onReact: (messageId: string, emoji: string, on: boolean) => void;
}) {
  const mounted = useMounted();
  const isDesktop = useIsDesktop();
  const [picker, setPicker] = useState<DOMRect | "sheet" | null>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const swallowClick = useRef(false);

  const reacted = new Set(message.reactions.filter((r) => r.reacted).map((r) => r.emoji));
  const mentionsViewer = message.mentions.some((m) => m.user.id === viewerId);

  function openPicker() {
    setPicker(isDesktop && toolbarRef.current ? toolbarRef.current.getBoundingClientRect() : "sheet");
  }

  function pick(emoji: string) {
    onReact(message.id, emoji, !reacted.has(emoji));
    setPicker(null);
  }

  function startPress() {
    pressTimer.current = setTimeout(() => {
      swallowClick.current = true;
      navigator.vibrate?.(10);
      setPicker("sheet");
    }, LONG_PRESS_MS);
  }
  function cancelPress() {
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = null;
  }

  // Keep the anchor in step with layout (e.g. the row reflowing as a
  // reaction lands) while the desktop popover is open.
  useLayoutEffect(() => {
    if (picker instanceof DOMRect && toolbarRef.current) {
      const next = toolbarRef.current.getBoundingClientRect();
      if (next.top !== picker.top || next.left !== picker.left) setPicker(next);
    }
  }, [picker, message.reactions]);

  return (
    <div
      id={`msg-${message.id}`}
      onTouchStart={startPress}
      onTouchEnd={cancelPress}
      onTouchMove={cancelPress}
      onTouchCancel={cancelPress}
      onContextMenu={(e) => {
        // Long-press on mobile also fires contextmenu (e.g. on images).
        if (!isDesktop) e.preventDefault();
      }}
      onClickCapture={(e) => {
        if (swallowClick.current) {
          swallowClick.current = false;
          e.preventDefault();
          e.stopPropagation();
        }
      }}
      className={`group/msg relative -mx-2 flex items-start gap-2.5 rounded-[10px] px-2 py-0.5 transition-colors [@media(hover:hover)]:hover:bg-surface-elevated/50 ${
        mentionsViewer ? "bg-accent-volt/10 shadow-[inset_2px_0_0_var(--accent-volt)] dark:bg-accent-volt/[0.05]" : ""
      } ${highlighted ? "message-flash" : ""}`}
    >
      {leading}
      <div className="min-w-0 flex-1">
        {header}
        <MessageBody message={message} viewerId={viewerId} />
        <ReactionChips reactions={message.reactions} onToggle={(emoji, on) => onReact(message.id, emoji, on)} onAdd={openPicker} />
      </div>

      {/* Hover toolbar — pointer devices only; sits in the row's top-right
          corner, lifted half above it so it never covers the text line. */}
      <div
        ref={toolbarRef}
        className={`absolute -top-3.5 right-2 z-10 hidden items-center gap-0.5 rounded-[10px] border border-border bg-surface p-0.5 shadow-sm [@media(hover:hover)]:group-hover/msg:flex ${
          picker ? "[@media(hover:hover)]:flex" : ""
        }`}
      >
        {TOOLBAR_QUICK.map((emoji) => (
          <button
            key={emoji}
            type="button"
            onClick={() => onReact(message.id, emoji, !reacted.has(emoji))}
            aria-label={`React ${emoji}`}
            aria-pressed={reacted.has(emoji)}
            className={`flex h-7 w-7 items-center justify-center rounded-[7px] text-[16px] transition hover:bg-surface-elevated active:scale-90 ${
              reacted.has(emoji) ? "bg-accent-volt/25" : ""
            }`}
          >
            {emoji}
          </button>
        ))}
        <button
          type="button"
          onClick={openPicker}
          aria-label="More reactions"
          className="flex h-7 w-7 items-center justify-center rounded-[7px] text-muted transition hover:bg-surface-elevated hover:text-foreground"
        >
          <SmilePlus size={16} />
        </button>
      </div>

      {mounted && picker instanceof DOMRect && (
        <PickerPopover anchor={picker} onClose={() => setPicker(null)}>
          <ReactionPicker reacted={reacted} onPick={pick} compact />
        </PickerPopover>
      )}
      <DialogOverlay open={picker === "sheet"} onClose={() => setPicker(null)} label="React to message">
        <p className="px-5 pb-2 text-center font-mono text-[10px] font-semibold tracking-[0.16em] text-muted uppercase">React</p>
        <ReactionPicker reacted={reacted} onPick={pick} />
      </DialogOverlay>
    </div>
  );
}
