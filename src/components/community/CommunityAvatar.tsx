/**
 * Circuit — a community's icon: its uploaded image, or a crest made from
 * its tag/initials. Square with the sliced corner (the same shape as player
 * avatars), tinted lime so a community is never mistaken for a person.
 */

import { sized } from "@/lib/imageUrl";

const SIZES = {
  sm: "h-8 w-8 cut-avatar text-[11px]",
  md: "h-11 w-11 cut-avatar text-sm",
  lg: "h-16 w-16 cut-avatar text-lg border-[3px] border-surface",
  xl: "h-20 w-20 cut-avatar text-2xl border-4 border-background sm:h-24 sm:w-24",
} as const;

/** How far the tile floats, by size: a hint on list rows, a real lift on headers and cards. */
const ELEVATION = {
  sm: "drop-shadow-[0_2px_3px_rgba(0,0,0,0.45)]",
  md: "drop-shadow-[0_4px_6px_rgba(0,0,0,0.5)]",
  lg: "drop-shadow-[0_8px_12px_rgba(0,0,0,0.55)]",
  xl: "drop-shadow-[0_10px_16px_rgba(0,0,0,0.6)]",
} as const;

export function communityInitials(name: string, tag?: string | null): string {
  if (tag) return tag.slice(0, 4);
  const words = name.replace(/[^A-Za-z0-9 ]/g, "").split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words.slice(0, 2).map((w) => w[0]).join("") : (words[0] ?? "?").slice(0, 2)).toUpperCase();
}

export function CommunityAvatar({
  name,
  iconUrl,
  tag,
  size = "md",
  className = "",
}: {
  name: string;
  iconUrl: string | null;
  tag?: string | null;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  // Placement (stacking, margins, visibility) belongs on the wrapper that now owns the tile's spot; sizing stays on the tile.
  const tokens = className.split(/\s+/).filter(Boolean);
  const placement = tokens.filter((t) => /^(?:[a-z]+:)*(?:relative|absolute|hidden|z-|-?m[trblxy]?-|flex$)/.test(t)).join(" ");
  const sizing = tokens.filter((t) => !/^(?:[a-z]+:)*(?:relative|absolute|hidden|z-|-?m[trblxy]?-|flex$)/.test(t)).join(" ");
  const base = `${SIZES[size]} shrink-0 overflow-hidden ${sizing}`;
  // The tile is clipped to its sliced shape, which also clips any shadow of its own, so the
  // lift comes from a drop-shadow on a wrapper: it follows the clipped outline, cut corner included.
  const lift = ELEVATION[size];
  return (
    <span className={`${placement.split(" ").includes("hidden") ? "" : "inline-flex"} shrink-0 ${lift} ${placement}`}>
      {iconUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- uploaded (/api/images) or external URLs, no next/image in this codebase
        <img src={sized(iconUrl, 96) ?? iconUrl} alt="" loading="lazy" decoding="async" className={`${base} bg-surface-elevated object-cover`} />
      ) : (
        // The inset lip and highlight are not clipped, so the tile reads as a raised key.
        <span
          className={`${base} font-display flex items-center justify-center bg-accent-volt font-bold tracking-tight text-accent-volt-foreground shadow-[inset_0_-4px_0_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.5)]`}
          aria-hidden
        >
          {communityInitials(name, tag)}
        </span>
      )}
    </span>
  );
}
