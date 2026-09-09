"use client";

/**
 * Circuit — sidebar "More" disclosure. The spec's flat nav list ends in a
 * single "More" item; Circuit has extra nav surface (Marketplace/Rewards,
 * the organizer Organize group, the Staff group) that doesn't fit that
 * flat shape. Folding it behind one toggle keeps every link one click
 * away without a permanent labeled section.
 *
 * Phase 16 (tablet): labels/section headers collapse to icon-only (with
 * a title tooltip) between `sm` and `lg`, same convention as the rest of
 * AppSidebar, since the expanded panel renders inline in that same
 * narrow 72px column rather than as a floating overlay.
 */

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, MoreHorizontal } from "lucide-react";

export type MoreSection = {
  label?: string;
  items: {
    href: string;
    label: string;
    icon: React.ComponentType<{ size?: number; className?: string }>;
    badge?: number;
  }[];
};

// "/dashboard" is itself a section index route with sibling paths under it
// (/dashboard/battles, /dashboard/disputes, /dashboard/payouts) — treat it
// like "/" (exact match only), or every sibling page would also light up
// "Tournaments" as active via the prefix-match branch below.
function isActive(pathname: string, href: string): boolean {
  return href === "/" || href === "/dashboard"
    ? pathname === href
    : pathname === href || pathname.startsWith(`${href}/`);
}

export function MoreMenu({ sections, pathname }: { sections: MoreSection[]; pathname: string }) {
  const containsActive = sections.some((s) => s.items.some((i) => isActive(pathname, i.href)));
  const [open, setOpen] = useState(containsActive);

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="More"
        className={`flex h-[46px] items-center justify-center gap-3 rounded-[9px] px-2 text-sm font-medium transition lg:justify-start lg:px-4 ${
          containsActive && !open ? "bg-accent-volt-soft text-foreground" : "text-muted hover:bg-surface-elevated hover:text-foreground"
        }`}
      >
        <MoreHorizontal size={18} className={containsActive && !open ? "text-accent-volt" : undefined} />
        <span className="hidden lg:inline">More</span>
        <ChevronDown size={14} className={`hidden transition lg:ml-auto lg:inline ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="flex flex-col gap-3 border-l border-border py-1 pl-1.5 lg:pl-3">
          {sections.map((section, i) => (
            <div key={section.label ?? i} className="flex flex-col gap-1">
              {section.label && <span className="text-eyebrow hidden px-3 lg:block">{section.label}</span>}
              {section.items.map((item) => {
                const Icon = item.icon;
                const active = isActive(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={item.label}
                    className={`relative flex h-10 items-center justify-center gap-2.5 rounded-[9px] px-1 text-sm font-medium transition lg:justify-start lg:px-3 ${
                      active ? "bg-accent-volt-soft text-foreground" : "text-muted hover:bg-surface-elevated hover:text-foreground"
                    }`}
                  >
                    <Icon size={17} className={active ? "text-accent-volt" : undefined} />
                    <span className="hidden lg:inline">{item.label}</span>
                    {!!item.badge && item.badge > 0 && (
                      <>
                        <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-live lg:hidden" aria-hidden />
                        <span className="badge badge-cancelled ml-auto hidden lg:inline-flex">{item.badge}</span>
                      </>
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
