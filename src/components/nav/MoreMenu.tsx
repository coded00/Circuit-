"use client";

/**
 * Circuit — sidebar "More" disclosure. The NEXA reference sidebar is one
 * flat list ending in a single "More" item; Circuit has extra nav surface
 * (Wallet/Marketplace/Rewards, the organizer Organize group, the Staff
 * group) that doesn't fit that flat shape. Folding it behind one toggle
 * keeps the collapsed sidebar visually flat like the reference while
 * keeping every link one click away, never removed.
 */

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, MoreHorizontal } from "lucide-react";

export type MoreSection = {
  label?: string;
  items: {
    href: string;
    label: string;
    icon: React.ComponentType<{ size?: number }>;
    badge?: number;
  }[];
};

function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export function MoreMenu({ sections, pathname }: { sections: MoreSection[]; pathname: string }) {
  const containsActive = sections.some((s) => s.items.some((i) => isActive(pathname, i.href)));
  const [open, setOpen] = useState(containsActive);

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition ${
          containsActive && !open ? "bg-brand-soft text-brand" : "text-muted hover:bg-surface-hover hover:text-foreground"
        }`}
      >
        <MoreHorizontal size={17} />
        More
        <ChevronDown size={14} className={`ml-auto transition ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="flex flex-col gap-3 border-l border-border py-1 pl-3">
          {sections.map((section, i) => (
            <div key={section.label ?? i} className="flex flex-col gap-1">
              {section.label && (
                <span className="px-3 text-xs font-bold tracking-wide text-muted uppercase">{section.label}</span>
              )}
              {section.items.map((item) => {
                const Icon = item.icon;
                const active = isActive(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition ${
                      active ? "bg-brand text-white" : "text-muted hover:bg-surface-hover hover:text-foreground"
                    }`}
                  >
                    <Icon size={17} />
                    {item.label}
                    {!!item.badge && item.badge > 0 && (
                      <span className="ml-auto rounded-full bg-status-cancelled/15 px-1.5 py-0.5 font-mono text-xs font-semibold tabular-nums text-status-cancelled">
                        {item.badge}
                      </span>
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
