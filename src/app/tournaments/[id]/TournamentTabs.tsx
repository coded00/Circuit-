"use client";

/**
 * Circuit — tournament page tab shell. Purely presentational/interactive
 * (which tab is active); every tab's actual content is real data already
 * fetched and formatted server-side in page.tsx and handed down as
 * ready-made nodes, matching this codebase's usual split (server does
 * data, client does interaction only).
 */

import { usePathname, useRouter, useSearchParams } from "next/navigation";

export type TournamentTab = { key: string; label: string; content: React.ReactNode };

export default function TournamentTabs({
  tabs,
  trailing,
}: {
  tabs: TournamentTab[];
  /** Optional content rendered on the same row as the tablist, right-
   *  aligned (e.g. a Share button) — the bracket page's own use of this
   *  shell needs one, the tournament page's doesn't. */
  trailing?: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const requested = searchParams.get("tab");
  const active = tabs.some((t) => t.key === requested) ? requested! : tabs[0]?.key;
  const activeTab = tabs.find((t) => t.key === active) ?? tabs[0];

  function selectTab(key: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", key);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <div
          role="tablist"
          aria-label="Tournament details"
          className="tabs scrollbar-hide overflow-x-auto"
        >
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              id={`tab-${t.key}`}
              aria-selected={t.key === active}
              aria-controls={`tabpanel-${t.key}`}
              onClick={() => selectTab(t.key)}
              className={`tab shrink-0 ${t.key === active ? "tab-active" : ""}`}
            >
              {t.label}
            </button>
          ))}
        </div>
        {trailing}
      </div>
      <div key={activeTab?.key} className="tab-content-enter" role="tabpanel" id={`tabpanel-${activeTab?.key}`} aria-labelledby={`tab-${activeTab?.key}`}>
        {activeTab?.content}
      </div>
    </div>
  );
}
