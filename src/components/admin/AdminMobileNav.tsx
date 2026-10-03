"use client";

/**
 * Circuit — admin mobile nav. Below `sm`, AdminSidebar renders nothing
 * (see its own comment), so this hamburger + left-edge drawer is the only
 * way to reach any admin section on a phone. Reuses ADMIN_NAV_ITEMS
 * directly rather than a curated subset — see AdminSidebar.tsx's comment
 * on why a "primary 5" split doesn't make sense for this list. Same
 * open/backdrop/click-outside pattern as MobileTabBar's own profile
 * sheet, just sliding in from the left edge instead of up from the
 * bottom (`.drawer-panel-enter`, globals.css).
 */

import { useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { ADMIN_NAV_GROUPS, isAdminNavActive } from "./AdminSidebar";

export function AdminMobileNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open admin menu"
        className="btn-icon sm:hidden"
      >
        <Menu size={18} />
      </button>

      {/* Portalled: the top bar's backdrop-blur makes it the containing block for
          fixed descendants, which would clip the drawer to the bar's 56px. */}
      {open &&
        createPortal(
          <div
            data-surface="dark"
            data-admin
            className="fixed inset-0 z-40 flex sm:hidden"
            onClick={() => setOpen(false)}
          >
            <div className="sheet-backdrop-enter absolute inset-0 bg-black/60" />
            <div
              className="drawer-panel-enter scrollbar-hide relative z-10 flex h-full w-[260px] max-w-[80vw] flex-col gap-1 overflow-y-auto border-r border-border bg-background p-4 pb-[calc(1rem_+_env(safe-area-inset-bottom))]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[13px] font-semibold">Circuit admin</span>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close"
                  className="btn-icon"
                >
                  <X size={18} className="text-muted" />
                </button>
              </div>

              {ADMIN_NAV_GROUPS.map((group) => (
                <div key={group.label} className="flex flex-col gap-px pb-3">
                  <span className="px-3 pb-1.5 text-[11px] font-medium text-muted-strong">
                    {group.label}
                  </span>
                  {group.items.map((item) => {
                    const active = isAdminNavActive(pathname, item.href);
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setOpen(false)}
                        aria-current={active ? "page" : undefined}
                        className={`relative flex h-10 items-center gap-2.5 rounded-[7px] px-3 text-[14px] font-medium ${
                          active
                            ? "bg-surface-elevated text-foreground"
                            : "text-muted hover:bg-surface-elevated hover:text-foreground"
                        }`}
                      >
                        {active && (
                          <span
                            aria-hidden
                            className="absolute top-2.5 bottom-2.5 left-0 w-[2px] rounded-full bg-accent-volt"
                          />
                        )}
                        <Icon
                          size={16}
                          className={
                            active ? "text-foreground" : "text-muted-strong"
                          }
                        />
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              ))}

              <div className="mt-auto border-t border-border pt-4">
                <Link
                  href="/"
                  onClick={() => setOpen(false)}
                  className="text-xs font-medium text-muted-strong transition hover:text-foreground"
                >
                  ← Back to Circuit
                </Link>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
