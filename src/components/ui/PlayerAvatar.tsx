/** Circuit — round player avatar with an initial fallback, at a few fixed sizes. */

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
    <img src={person.avatarUrl} alt="" className={`${box} shrink-0 rounded-full object-cover ${className}`} />
  ) : (
    <span
      className={`${box} flex shrink-0 items-center justify-center rounded-full bg-surface-elevated font-display font-bold text-muted uppercase ${className}`}
    >
      {person.displayName.slice(0, 1)}
    </span>
  );
}
