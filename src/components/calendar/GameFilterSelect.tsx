"use client";

import { useRouter } from "next/navigation";

/**
 * Circuit — `/calendar` game filter. The only bit of the page that needs
 * client JS: an auto-submitting `<select>` (no separate "Apply" button)
 * that rebuilds the current query string with a new `game` value and
 * navigates, same URL-is-the-state model the rest of the page uses.
 */
export function GameFilterSelect({
  game,
  options,
  baseQuery,
}: {
  game: string;
  options: readonly string[];
  baseQuery: Record<string, string>;
}) {
  const router = useRouter();

  function go(nextGame: string) {
    const params = new URLSearchParams(baseQuery);
    if (nextGame) params.set("game", nextGame);
    else params.delete("game");
    const qs = params.toString();
    router.push(qs ? `/calendar?${qs}` : "/calendar");
  }

  return (
    <select
      value={game}
      onChange={(e) => go(e.target.value)}
      className="field-select w-auto min-w-[150px]"
      aria-label="Filter by game"
    >
      <option value="">All Games</option>
      {options.map((g) => (
        <option key={g} value={g}>
          {g}
        </option>
      ))}
    </select>
  );
}
