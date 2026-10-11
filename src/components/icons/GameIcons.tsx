/**
 * Circuit — the main navigation icons, drawn angular: mitred joins, square
 * ends and chamfered corners, so they carry the same sliced-corner language
 * as the rest of the interface. Same call shape as the lucide icons they
 * replace (`size`, `className`).
 */

type IconProps = { size?: number; className?: string };

function Icon({ size = 20, className, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="square"
      strokeLinejoin="miter"
      className={className}
      aria-hidden
    >
      {children}
    </svg>
  );
}

export const HomeIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 11L12 3L21 11V17L17 21H3Z" />
    <path d="M10 21V15H14V21" />
  </Icon>
);

export const TrophyIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M7 4H17V10L14 14H10L7 10Z" />
    <path d="M7 6H4V8L7 10" />
    <path d="M17 6H20V8L17 10" />
    <path d="M12 14V18" />
    <path d="M8 21H16V18H8Z" />
  </Icon>
);

export const PadIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 8H19L21 17L18 19L15 16H9L6 19L3 17Z" />
    <path d="M8 10.5V13.5M6.5 12H9.5" />
    <path d="M16 11H17M14.5 13H15.5" />
  </Icon>
);

export const SwordsIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 4L14 14M12 16L16 12M14 14L19 19" />
    <path d="M20 4L10 14M12 16L8 12M10 14L5 19" />
  </Icon>
);

export const ChatIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 4H20V15H12L7 19V15H4Z" />
    <path d="M8 9H16M8 12H13" />
  </Icon>
);

export const CalendarIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 5H20V16L16 20H4Z" />
    <path d="M4 10H20M8 3V7M16 3V7" />
  </Icon>
);

export const ShopIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 9L6 4H18L20 9" />
    <path d="M4 9H20V20H4Z" />
    <path d="M10 20V14H14V20" />
  </Icon>
);

export const PlayerIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M9 3H15L17 5V9L15 11H9L7 9V5Z" />
    <path d="M4 21V18L8 14H16L20 18V21Z" />
  </Icon>
);
