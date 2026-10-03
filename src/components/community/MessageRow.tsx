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
import { CornerUpLeft, Flag, Lock, MessagesSquare, Pin, PinOff, SmilePlus, Trash2 } from "lucide-react";
import { ReportDialog } from "./ReportDialog";
import type { ReactionSummary } from "@/lib/communityReactions";
import { DialogOverlay, useIsDesktop, useMounted } from "@/components/ui/Overlay";
import { MessageBody, type MessageContent } from "./MessageBody";
import { ReactionChips, ReactionPicker } from "./MessageReactions";

const LONG_PRESS_MS = 450;
const TOOLBAR_QUICK = ["❤️", "🔥", "😂"];
const POPOVER_WIDTH = 320;
const POPOVER_HEIGHT = 330;

export type RowMessage = MessageContent & {
  id: string;
  reactions: ReactionSummary[];
  replyTo?: { id: string; authorName: string; snippet: string; removed: boolean } | null;
  pinned?: boolean;
  thread?: { id: string; title: string; messageCount: number; locked: boolean } | null;
};

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
      className="fixed z-50 overflow-hidden cut-sm [--cut-line:var(--border)] border border-border bg-surface pt-3"
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
  onDelete,
  canReport = false,
  onReply,
  onStartThread,
  onTogglePin,
  onOpenThread,
  onJumpTo,
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
  /** Present when the viewer may remove this message (theirs, or they moderate). */
  onDelete?: (messageId: string) => void;
  /** Someone else's message: offer "Report". */
  canReport?: boolean;
  onReply?: () => void;
  onStartThread?: () => void;
  /** Moderators: pin/unpin to the channel. */
  onTogglePin?: () => void;
  onOpenThread?: (threadId: string) => void;
  /** Scroll to the quoted message. */
  onJumpTo?: (messageId: string) => void;
}) {
  const [reporting, setReporting] = useState(false);
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
      className={`group/msg relative -mx-2 flex items-start gap-2.5 rounded-none px-2 py-0.5 transition-colors [@media(hover:hover)]:hover:bg-surface-elevated/50 ${
        mentionsViewer ? "bg-accent-volt/10 shadow-[inset_2px_0_0_var(--accent-volt)] dark:bg-accent-volt/[0.05]" : ""
      } ${highlighted ? "message-flash" : ""}`}
    >
      {leading}
      <div className="min-w-0 flex-1">
        {message.replyTo && (
          <button
            type="button"
            onClick={() => message.replyTo && !message.replyTo.removed && onJumpTo?.(message.replyTo.id)}
            className="mb-0.5 flex max-w-full items-center gap-1.5 text-left text-[12.5px] text-muted hover:text-foreground"
          >
            <CornerUpLeft size={12} className="shrink-0" />
            {message.replyTo.removed ? (
              <span className="italic">Original message removed</span>
            ) : (
              <span className="truncate">
                <span className="font-semibold">{message.replyTo.authorName}</span> {message.replyTo.snippet}
              </span>
            )}
          </button>
        )}
        {header}
        {message.pinned && (
          <span className="mb-0.5 flex items-center gap-1 text-[11px] font-semibold text-muted">
            <Pin size={11} /> Pinned
          </span>
        )}
        <MessageBody message={message} viewerId={viewerId} />
        <ReactionChips reactions={message.reactions} onToggle={(emoji, on) => onReact(message.id, emoji, on)} onAdd={openPicker} />
        {message.thread && (
          <button
            type="button"
            onClick={() => message.thread && onOpenThread?.(message.thread.id)}
            className="mt-1 flex max-w-full items-center gap-2 rounded-none border border-border bg-surface px-2.5 py-1.5 text-left text-[13px] transition hover:border-border-hover"
          >
            <MessagesSquare size={14} className="shrink-0 text-muted" />
            <span className="truncate font-semibold">{message.thread.title}</span>
            {message.thread.locked && <Lock size={11} className="shrink-0 text-muted" />}
            <span className="shrink-0 text-muted">
              {message.thread.messageCount} {message.thread.messageCount === 1 ? "reply" : "replies"}
            </span>
          </button>
        )}
      </div>

      {/* Hover toolbar — pointer devices only; sits in the row's top-right
          corner, lifted half above it so it never covers the text line. */}
      <div
        ref={toolbarRef}
        className={`absolute -top-3.5 right-2 z-10 hidden items-center gap-0.5 rounded-none border border-border bg-surface p-0.5 shadow-sm [@media(hover:hover)]:group-hover/msg:flex ${
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
            className={`flex h-7 w-7 items-center justify-center cut-avatar text-[16px] transition hover:bg-surface-elevated active:scale-90 ${
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
          className="flex h-7 w-7 items-center justify-center cut-avatar text-muted transition hover:bg-surface-elevated hover:text-foreground"
        >
          <SmilePlus size={16} />
        </button>
        {onReply && (
          <button type="button" onClick={onReply} aria-label="Reply" className="flex h-7 w-7 items-center justify-center cut-avatar text-muted transition hover:bg-surface-elevated hover:text-foreground">
            <CornerUpLeft size={15} />
          </button>
        )}
        {onStartThread && (
          <button type="button" onClick={onStartThread} aria-label="Start thread" className="flex h-7 w-7 items-center justify-center cut-avatar text-muted transition hover:bg-surface-elevated hover:text-foreground">
            <MessagesSquare size={15} />
          </button>
        )}
        {onTogglePin && (
          <button
            type="button"
            onClick={onTogglePin}
            aria-label={message.pinned ? "Unpin message" : "Pin message"}
            className="flex h-7 w-7 items-center justify-center cut-avatar text-muted transition hover:bg-surface-elevated hover:text-foreground"
          >
            {message.pinned ? <PinOff size={15} /> : <Pin size={15} />}
          </button>
        )}
        {canReport && (
          <button
            type="button"
            onClick={() => setReporting(true)}
            aria-label="Report message"
            className="flex h-7 w-7 items-center justify-center cut-avatar text-muted transition hover:bg-surface-elevated hover:text-foreground"
          >
            <Flag size={14} />
          </button>
        )}
        {onDelete && (
          <button
            type="button"
            onClick={() => onDelete(message.id)}
            aria-label="Remove message"
            className="flex h-7 w-7 items-center justify-center cut-avatar text-muted transition hover:bg-danger/10 hover:text-danger"
          >
            <Trash2 size={15} />
          </button>
        )}
      </div>

      {mounted && picker instanceof DOMRect && (
        <PickerPopover anchor={picker} onClose={() => setPicker(null)}>
          <ReactionPicker reacted={reacted} onPick={pick} compact />
        </PickerPopover>
      )}
      <DialogOverlay open={picker === "sheet"} onClose={() => setPicker(null)} label="React to message">
        <p className="px-5 pb-2 text-center font-mono text-[10px] font-semibold tracking-[0.16em] text-muted uppercase">React</p>
        <ReactionPicker reacted={reacted} onPick={pick} />
        {(onReply || onStartThread || onTogglePin) && (
          <div className="grid grid-cols-3 gap-2 border-t border-border px-4 pt-2">
            {onReply && (
              <button type="button" onClick={() => (setPicker(null), onReply())} className="flex h-11 items-center justify-center gap-1.5 rounded-none text-sm font-semibold hover:bg-surface-elevated">
                <CornerUpLeft size={15} /> Reply
              </button>
            )}
            {onStartThread && (
              <button type="button" onClick={() => (setPicker(null), onStartThread())} className="flex h-11 items-center justify-center gap-1.5 rounded-none text-sm font-semibold hover:bg-surface-elevated">
                <MessagesSquare size={15} /> Thread
              </button>
            )}
            {onTogglePin && (
              <button type="button" onClick={() => (setPicker(null), onTogglePin())} className="flex h-11 items-center justify-center gap-1.5 rounded-none text-sm font-semibold hover:bg-surface-elevated">
                {message.pinned ? <PinOff size={15} /> : <Pin size={15} />} {message.pinned ? "Unpin" : "Pin"}
              </button>
            )}
          </div>
        )}
        {canReport && (
          <div className="border-t border-border px-4 pt-2">
            <button
              type="button"
              onClick={() => {
                setPicker(null);
                setReporting(true);
              }}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-none text-sm font-semibold transition hover:bg-surface-elevated"
            >
              <Flag size={16} /> Report message
            </button>
          </div>
        )}
        {onDelete && (
          <div className="border-t border-border px-4 pt-2 pb-4">
            <button
              type="button"
              onClick={() => {
                setPicker(null);
                onDelete(message.id);
              }}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-none text-sm font-semibold text-danger transition hover:bg-danger/10"
            >
              <Trash2 size={16} /> Remove message
            </button>
          </div>
        )}
      </DialogOverlay>
      {canReport && <ReportDialog open={reporting} onClose={() => setReporting(false)} target={{ targetType: "MESSAGE", messageId: message.id }} title="Report this message" />}
    </div>
  );
}
