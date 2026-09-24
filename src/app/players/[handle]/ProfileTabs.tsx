"use client";

/**
 * Circuit — player profile tab shell. Overview is always where a profile
 * opens: the active tab is local state, never written to the URL, so a
 * refresh, a shared link or coming back later all land on Overview.
 *
 * The one exception is an explicit deep link (`?tab=friends`, used by the
 * account menu's Friends shortcut): honoured once on arrival, then
 * stripped from the address bar so it doesn't stick. Switching tabs is
 * instant — every tab's content is already server-rendered and handed
 * down, so there's no navigation or refetch per click (the old shell
 * round-tripped the whole page through the router on every tab change).
 */

import { createContext, useContext, useEffect, useRef, useState } from "react";

export type ProfileTab = { key: string; label: string; count?: number; content: React.ReactNode };

const SelectTabContext = createContext<(key: string) => void>(() => {});

export function ProfileTabs({ tabs, initialTab }: { tabs: ProfileTab[]; initialTab?: string }) {
  const [active, setActive] = useState(() => (tabs.some((t) => t.key === initialTab) ? initialTab! : tabs[0].key));
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("tab")) return;
    url.searchParams.delete("tab");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }, []);

  function select(key: string) {
    setActive(key);
    // On phones the tab strip scrolls sideways — keep the chosen tab visible.
    document.getElementById(`profile-tab-${key}`)?.scrollIntoView({ block: "nearest", inline: "nearest" });
    // Coming from a "View all" link deep in Overview: scroll back so the
    // new tab starts at its top, just under the pinned tab bar. (Measured
    // on the whole section — the sticky bar itself never leaves the screen.)
    const root = rootRef.current;
    if (root && root.getBoundingClientRect().top < 60) {
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      window.scrollTo({ top: window.scrollY + root.getBoundingClientRect().top - 72, behavior: reduceMotion ? "auto" : "smooth" });
    }
  }

  const activeTab = tabs.find((t) => t.key === active) ?? tabs[0];

  return (
    <SelectTabContext.Provider value={select}>
      <div ref={rootRef} className="flex min-w-0 flex-col gap-6">
        <div className="sticky top-[60px] z-20 -mx-4 bg-background/90 px-4 backdrop-blur-md sm:-mx-8 sm:px-8">
          <div role="tablist" aria-label="Profile sections" className="tabs scrollbar-hide overflow-x-auto">
            {tabs.map((t) => (
              <button
                key={t.key}
                type="button"
                role="tab"
                id={`profile-tab-${t.key}`}
                aria-selected={t.key === active}
                aria-controls={`profile-panel-${t.key}`}
                onClick={() => select(t.key)}
                className={`tab flex shrink-0 items-center gap-1.5 py-3 ${t.key === active ? "tab-active" : ""}`}
              >
                {t.label}
                {t.count !== undefined && t.count > 0 && (
                  <span className="font-mono text-[11px] text-muted tabular-nums">{t.count}</span>
                )}
              </button>
            ))}
          </div>
        </div>
        <div
          key={activeTab.key}
          role="tabpanel"
          id={`profile-panel-${activeTab.key}`}
          aria-labelledby={`profile-tab-${activeTab.key}`}
          className="tab-content-enter"
        >
          {activeTab.content}
        </div>
      </div>
    </SelectTabContext.Provider>
  );
}

/** A "View all" style link inside a tab's content that switches tabs. */
export function ProfileTabLink({ tab, children, className }: { tab: string; children: React.ReactNode; className?: string }) {
  const select = useContext(SelectTabContext);
  return (
    <button type="button" onClick={() => select(tab)} className={className}>
      {children}
    </button>
  );
}
