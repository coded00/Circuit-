/** Circuit — round player avatar with an initial fallback, at a few fixed sizes. */

import { sized } from "@/lib/imageUrl";

const SIZE_PX = { xs: 24, sm: 32, md: 40, lg: 96, xl: 80 } as const;

const SIZES = {
  xs: "h-6 w-6 text-[10px]",
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-16 w-16 text-2xl sm:h-24 sm:w-24 sm:text-3xl",
  xl: "h-16 w-16 text-2xl sm:h-20 sm:w-20 sm:text-3xl",
} as const;

export function PlayerAvatar({
  person,
  size,
  className = "",
}: {
  person: { displayName: string; avatarUrl: string | null };
  size: keyof typeof SIZES;
  className?: string;
}) {
  const box = SIZES[size];
  return person.avatarUrl ? (
    // eslint-disable-next-line @next/next/no-img-element -- uploaded or external avatar URL
    <img src={sized(person.avatarUrl, SIZE_PX[size]) ?? person.avatarUrl} alt="" loading="lazy" decoding="async" className={`${box} shrink-0 cut-avatar object-cover ${className}`} />
  ) : (
    <span
      className={`${box} flex shrink-0 items-center justify-center cut-avatar bg-surface-elevated font-display font-bold text-muted uppercase ${className}`}
    >
      {person.displayName.slice(0, 1)}
    </span>
  );
}
