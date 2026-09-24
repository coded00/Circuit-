"use client";

/**
 * Circuit Community — the message composer: auto-growing text box, an
 * emoji/sticker tray (opens below the input, WhatsApp-style, so the
 * message list shrinks instead of being covered), and image attach with a
 * preview + optional caption. Also accepts a pasted image.
 *
 * Images go through prepareImage (src/lib/prepareImage.ts) before upload
 * — downscaled, re-encoded, and stripped of EXIF/GPS metadata.
 */

import { useEffect, useRef, useState } from "react";
import { ImagePlus, Send, Smile, Sticker as StickerIcon, X } from "lucide-react";
import { STICKERS } from "@/lib/stickers";
import { Spinner } from "@/components/Spinner";
import { EMOJI_CATEGORIES } from "./emojiData";
import { StickerArt } from "./StickerArt";
import { ACCEPTED_IMAGE_TYPES, prepareImage, type PreparedImage } from "@/lib/prepareImage";

const RECENT_EMOJI_KEY = "circuit-recent-emoji";
const MAX_RECENT_EMOJI = 16;

export type ComposerSubmit =
  | { kind: "TEXT"; content: string }
  | { kind: "STICKER"; stickerId: string }
  | { kind: "IMAGE"; image: PreparedImage; caption: string };

function readRecentEmoji(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(RECENT_EMOJI_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((e) => typeof e === "string").slice(0, MAX_RECENT_EMOJI) : [];
  } catch {
    return [];
  }
}

export function ChatComposer({
  channelName,
  sending,
  onSubmit,
  onError,
}: {
  channelName: string;
  sending: boolean;
  /** Resolves true once the message is actually sent, so the composer
   *  only clears the draft/attachment on success. */
  onSubmit: (message: ComposerSubmit) => Promise<boolean>;
  onError: (message: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const [image, setImage] = useState<PreparedImage | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [tray, setTray] = useState<"emoji" | "stickers" | null>(null);
  const [emojiCategory, setEmojiCategory] = useState("recent");
  const [recentEmoji, setRecentEmoji] = useState<string[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Read after mount (localStorage doesn't exist during SSR); fall back
  // to the first real category when there's no history yet.
  useEffect(() => {
    const recent = readRecentEmoji();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time post-mount read of browser-only storage
    setRecentEmoji(recent);
    if (recent.length === 0) setEmojiCategory(EMOJI_CATEGORIES[0].key);
  }, []);

  // Free the preview's object URL when it's replaced or removed.
  useEffect(() => {
    return () => {
      if (image) URL.revokeObjectURL(image.previewUrl);
    };
  }, [image]);

  // Auto-grow up to ~5 lines, then scroll inside the box.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
  }, [draft]);

  async function attach(file: File) {
    setPreparing(true);
    try {
      setImage(await prepareImage(file, { maxEdge: 1600 }));
      setTray(null);
      textareaRef.current?.focus();
    } catch (err) {
      onError(err instanceof Error ? err.message : "That image couldn't be added.");
    } finally {
      setPreparing(false);
    }
  }

  function insertEmoji(emoji: string) {
    const el = textareaRef.current;
    const start = el?.selectionStart ?? draft.length;
    const end = el?.selectionEnd ?? draft.length;
    setDraft(draft.slice(0, start) + emoji + draft.slice(end));
    // Put the caret after the inserted emoji once React has re-rendered.
    requestAnimationFrame(() => {
      if (!el) return;
      el.selectionStart = el.selectionEnd = start + emoji.length;
    });

    const nextRecent = [emoji, ...recentEmoji.filter((e) => e !== emoji)].slice(0, MAX_RECENT_EMOJI);
    setRecentEmoji(nextRecent);
    try {
      localStorage.setItem(RECENT_EMOJI_KEY, JSON.stringify(nextRecent));
    } catch {
      // Storage blocked — recents just won't persist.
    }
  }

  async function submit() {
    if (sending || preparing) return;
    if (image) {
      if (await onSubmit({ kind: "IMAGE", image, caption: draft })) {
        setImage(null);
        setDraft("");
      }
    } else if (draft.trim()) {
      if (await onSubmit({ kind: "TEXT", content: draft })) setDraft("");
    }
  }

  async function sendSticker(stickerId: string) {
    if (sending) return;
    if (await onSubmit({ kind: "STICKER", stickerId })) setTray(null);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends on a real keyboard; on touch devices Enter stays a
    // newline and the send button is how you send (the norm for mobile chat).
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      if (window.matchMedia("(pointer: coarse)").matches) return;
      event.preventDefault();
      submit();
    }
  }

  function handlePaste(event: React.ClipboardEvent<HTMLTextAreaElement>) {
    const file = Array.from(event.clipboardData.files).find((f) => ACCEPTED_IMAGE_TYPES.split(",").includes(f.type));
    if (file) {
      event.preventDefault();
      attach(file);
    }
  }

  const canSend = !sending && !preparing && (image !== null || draft.trim().length > 0);
  const emojis =
    emojiCategory === "recent" ? recentEmoji : (EMOJI_CATEGORIES.find((c) => c.key === emojiCategory)?.emojis ?? []);

  return (
    <div className="flex flex-col">
      {(image || preparing) && (
        <div className="flex items-center gap-3 px-3 pt-3">
          <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-[10px] border border-border bg-surface-elevated">
            {image ? (
              // eslint-disable-next-line @next/next/no-img-element -- local object URL preview
              <img src={image.previewUrl} alt="Selected image" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center">
                <Spinner size={18} className="text-muted" />
              </div>
            )}
            {image && (
              <button
                type="button"
                onClick={() => setImage(null)}
                aria-label="Remove image"
                className="absolute top-1 right-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-white"
              >
                <X size={14} />
              </button>
            )}
          </div>
          <span className="text-metadata">{image ? "Add a caption (optional), then send." : "Preparing image…"}</span>
        </div>
      )}

      <div className="flex items-end gap-2 p-3">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={preparing || sending}
          aria-label="Attach image"
          className="btn-icon shrink-0"
        >
          <ImagePlus size={20} />
        </button>
        <input
          ref={fileRef}
          type="file"
          accept={ACCEPTED_IMAGE_TYPES}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = ""; // allow re-picking the same file
            if (file) attach(file);
          }}
        />

        <div className="flex min-w-0 flex-1 items-end rounded-[22px] border border-border bg-surface-elevated/60 pr-1 transition focus-within:border-border-strong">
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            onFocus={() => setTray(null)}
            placeholder={image ? "Add a caption…" : `Message #${channelName}`}
            maxLength={2000}
            rows={1}
            className="scrollbar-hide max-h-32 min-w-0 flex-1 resize-none bg-transparent py-2.5 pl-4 text-[15px] leading-5 outline-none placeholder:text-muted"
          />
          <button
            type="button"
            onClick={() => {
              setTray(tray === "emoji" ? null : "emoji");
              textareaRef.current?.blur();
            }}
            aria-label="Emoji"
            aria-pressed={tray === "emoji"}
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition hover:text-foreground ${tray === "emoji" ? "text-accent-blue" : "text-muted"}`}
          >
            <Smile size={20} />
          </button>
          <button
            type="button"
            onClick={() => {
              setTray(tray === "stickers" ? null : "stickers");
              textareaRef.current?.blur();
            }}
            aria-label="Stickers"
            aria-pressed={tray === "stickers"}
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition hover:text-foreground ${tray === "stickers" ? "text-accent-blue" : "text-muted"}`}
          >
            <StickerIcon size={20} />
          </button>
        </div>

        <button
          type="button"
          onClick={submit}
          disabled={!canSend}
          aria-label="Send message"
          className="btn-primary !h-11 !w-11 shrink-0 !rounded-full !p-0"
        >
          {sending ? <Spinner size={16} /> : <Send size={18} />}
        </button>
      </div>

      {tray === "emoji" && (
        <div className="border-t border-border">
          <div className="scrollbar-hide flex gap-1 overflow-x-auto px-2 pt-2">
            {recentEmoji.length > 0 && (
              <button
                type="button"
                onClick={() => setEmojiCategory("recent")}
                className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${emojiCategory === "recent" ? "bg-surface-elevated text-foreground" : "text-muted"}`}
              >
                Recent
              </button>
            )}
            {EMOJI_CATEGORIES.map((category) => (
              <button
                key={category.key}
                type="button"
                onClick={() => setEmojiCategory(category.key)}
                className={`flex shrink-0 items-center gap-1 rounded-full px-3 py-1 text-xs font-medium ${emojiCategory === category.key ? "bg-surface-elevated text-foreground" : "text-muted"}`}
              >
                <span aria-hidden>{category.icon}</span>
                {category.label}
              </button>
            ))}
          </div>
          <div className="scrollbar-hide grid h-52 grid-cols-8 content-start gap-0.5 overflow-y-auto p-2 sm:grid-cols-10">
            {emojis.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => insertEmoji(emoji)}
                className="flex aspect-square items-center justify-center rounded-lg text-[26px] transition hover:bg-surface-elevated active:scale-90"
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}

      {tray === "stickers" && (
        <div className="scrollbar-hide grid h-60 grid-cols-3 content-start gap-x-3 gap-y-4 overflow-y-auto border-t border-border p-4 sm:grid-cols-4">
          {STICKERS.map((sticker) => (
            <button
              key={sticker.id}
              type="button"
              onClick={() => sendSticker(sticker.id)}
              disabled={sending}
              aria-label={`Send ${sticker.label} sticker`}
              className="flex items-center justify-center rounded-xl p-1 transition hover:scale-105 active:scale-95 disabled:opacity-50"
            >
              <StickerArt sticker={sticker} size="sm" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
