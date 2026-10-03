/**
 * Circuit — a community's icon: its uploaded image, or a crest made from
 * its tag/initials. Square with the sliced corner (the same shape as player
 * avatars), tinted lime so a community is never mistaken for a person.
 */

const SIZES = {
  sm: "h-8 w-8 cut-avatar text-[11px]",
  md: "h-11 w-11 cut-avatar text-sm",
  lg: "h-16 w-16 cut-avatar text-lg border-[3px] border-surface",
  xl: "h-20 w-20 cut-avatar text-2xl border-4 border-background sm:h-24 sm:w-24",
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
  const base = `${SIZES[size]} shrink-0 overflow-hidden ${className}`;
  if (iconUrl) {
    // eslint-disable-next-line @next/next/no-img-element -- uploaded (/api/images) or external URLs, no next/image in this codebase
    return <img src={iconUrl} alt="" className={`${base} bg-surface-elevated object-cover`} />;
  }
  return (
    <span className={`${base} font-display flex items-center justify-center bg-accent-volt font-bold tracking-tight text-accent-volt-foreground`} aria-hidden>
      {communityInitials(name, tag)}
    </span>
  );
}
