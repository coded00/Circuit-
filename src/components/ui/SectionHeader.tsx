import Link from "next/link";
import { ChevronRight } from "lucide-react";

/**
 * Circuit — a page section's heading row: title on the left, an optional
 * "View all" link on the right. No subtitle filler, no divider line — the
 * content right below says what the section is.
 */
export function SectionHeader({
  title,
  href,
  linkLabel = "View all",
  meta,
}: {
  title: string;
  href?: string;
  linkLabel?: string;
  /** Small mono count/label beside the title. */
  meta?: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <div className="flex min-w-0 items-baseline gap-2">
        <h2 className="text-section-heading truncate">{title}</h2>
        {meta !== undefined && meta !== null && <span className="font-mono text-xs text-muted tabular-nums">{meta}</span>}
      </div>
      {href && (
        <Link
          href={href}
          className="flex shrink-0 items-center gap-0.5 text-xs font-medium text-accent-blue transition-all hover:gap-1"
        >
          {linkLabel}
          <ChevronRight size={13} />
        </Link>
      )}
    </div>
  );
}
