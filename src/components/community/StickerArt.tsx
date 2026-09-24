import type { Sticker, StickerTone } from "@/lib/stickers";

/**
 * Renders one built-in sticker (src/lib/stickers.ts) — pure CSS on
 * Circuit's own tokens, no image asset. Slight tilt + chunky display type
 * so it reads as a sticker, not just a coloured button.
 */

const TONE_CLASSES: Record<StickerTone, string> = {
  volt: "bg-accent-volt text-accent-volt-foreground",
  orange: "bg-accent-orange text-white",
  blue: "bg-accent-blue text-white",
  live: "bg-live text-white",
  gold: "bg-gold text-black/85",
  dark: "bg-[#101318] text-white ring-1 ring-white/15",
};

export function StickerArt({ sticker, size = "md" }: { sticker: Sticker; size?: "sm" | "md" }) {
  const box =
    size === "md"
      ? "min-w-[104px] px-4 py-5 text-[26px] rounded-[18px]"
      : "min-w-0 w-full px-2 py-3 text-[15px] rounded-[12px]";
  const badge = size === "md" ? "h-8 w-8 text-base -top-2.5 -right-2.5" : "h-6 w-6 text-xs -top-1.5 -right-1.5";

  return (
    <span
      className={`relative inline-flex -rotate-3 items-center justify-center font-display leading-none font-extrabold tracking-tight uppercase shadow-[0_6px_0_rgba(0,0,0,0.18)] ${box} ${TONE_CLASSES[sticker.tone]}`}
    >
      {sticker.label}
      <span
        aria-hidden
        className={`absolute flex rotate-6 items-center justify-center rounded-full bg-white shadow-md ${badge}`}
      >
        {sticker.emoji}
      </span>
    </span>
  );
}
