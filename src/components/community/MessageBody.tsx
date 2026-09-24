"use client";

/**
 * Circuit Community — renders one message's content by kind: text (with
 * emoji-only messages shown large, the way every chat app does), an image
 * (sized from its stored dimensions so nothing jumps while it loads; tap
 * to view full screen), or a built-in sticker.
 */

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { getSticker } from "@/lib/stickers";
import { StickerArt } from "./StickerArt";

export type MessageContent = {
  kind: "TEXT" | "IMAGE" | "STICKER";
  content: string;
  imageUrl: string | null;
  imageWidth: number | null;
  imageHeight: number | null;
  stickerId: string | null;
};

const IMAGE_MAX_WIDTH = 320;
const IMAGE_MAX_HEIGHT = 320;

const EMOJI_ONLY = /^(?:\p{Extended_Pictographic}|\p{Emoji_Component}|‍|️|\s)+$/u;
const graphemes = typeof Intl !== "undefined" && "Segmenter" in Intl ? new Intl.Segmenter() : null;

/** 1–3 emoji and nothing else → render big. Digits/`#`/`*` are
 *  Emoji_Component too, so require at least one real pictograph. */
function bigEmojiCount(text: string): number {
  const trimmed = text.trim();
  if (!trimmed || !EMOJI_ONLY.test(trimmed) || !/\p{Extended_Pictographic}/u.test(trimmed)) return 0;
  const count = graphemes ? [...graphemes.segment(trimmed.replace(/\s/g, ""))].length : 99;
  return count <= 3 ? count : 0;
}

function TextBody({ text }: { text: string }) {
  const big = bigEmojiCount(text);
  if (big > 0) {
    return <p className={`leading-tight ${big === 1 ? "text-5xl" : "text-4xl"}`}>{text.trim()}</p>;
  }
  return <p className="text-[15px] leading-relaxed whitespace-pre-wrap break-words text-foreground/90">{text}</p>;
}

function Lightbox({ src, onClose }: { src: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Image"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute top-4 right-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white"
      >
        <X size={20} />
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element -- access-checked API route, not an optimisable static asset */}
      <img src={src} alt="" className="max-h-full max-w-full rounded-lg object-contain" />
    </div>,
    document.body
  );
}

function ImageBody({ message }: { message: MessageContent }) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  if (!message.imageUrl) return null;

  const w = message.imageWidth ?? 4;
  const h = message.imageHeight ?? 3;
  const width = Math.round(Math.min(IMAGE_MAX_WIDTH, (IMAGE_MAX_HEIGHT * w) / h));

  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open image"
        className={`block max-w-full overflow-hidden rounded-[12px] border border-border ${loaded ? "" : "skeleton"}`}
        style={{ width: `min(100%, ${width}px)`, aspectRatio: `${w} / ${h}` }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- access-checked API route, not an optimisable static asset */}
        <img
          src={message.imageUrl}
          alt={message.content || "Image"}
          loading="lazy"
          onLoad={() => setLoaded(true)}
          className="h-full w-full object-cover"
        />
      </button>
      {message.content && <TextBody text={message.content} />}
      {open && <Lightbox src={message.imageUrl} onClose={() => setOpen(false)} />}
    </div>
  );
}

export function MessageBody({ message }: { message: MessageContent }) {
  if (message.kind === "IMAGE") return <ImageBody message={message} />;
  if (message.kind === "STICKER") {
    const sticker = getSticker(message.stickerId);
    return sticker ? (
      <div className="py-2 pl-1">
        <StickerArt sticker={sticker} />
      </div>
    ) : (
      <p className="text-sm text-muted italic">Sticker unavailable</p>
    );
  }
  return <TextBody text={message.content} />;
}
