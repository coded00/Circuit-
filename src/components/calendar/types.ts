/**
 * Circuit — `/calendar` shared event shape. Four real, schema-backed
 * event kinds:
 *
 * - "tournament": a real `Tournament`, dated by its real `startAt`.
 * - "challenge": a real, still-`OPEN` `Battle` (the Challenges feature),
 *   dated by its real `createdAt` — Battle has no scheduled future date
 *   (it's an instant, first-come-first-served challenge, same as the
 *   homepage's Open Challenges rail), so "when it appeared" is the only
 *   honest date to plot it by.
 * - "community" / "game_release": real, admin-authored `CalendarEvent`
 *   rows (Admin > Calendar > Create Event) — these two categories were
 *   originally left out entirely (no schema backing existed), but now
 *   do: Tournaments/Challenges still can't be admin-authored here (that
 *   would mean inventing a "competition" with no real Tournament behind
 *   it), so Create Event only ever offers these two categories.
 */

export type TournamentEvent = {
  kind: "tournament";
  id: string;
  date: Date;
  name: string;
  game: string;
  status: string;
  format: string;
  teamSize: string;
  entryFee: number;
  prizeAmount: number | null;
  prizeText: string | null;
  participantCap: number;
  registered: number;
};

export type ChallengeEvent = {
  kind: "challenge";
  id: string;
  date: Date;
  game: string;
  format: string;
  status: string;
  hostName: string;
};

export type CommunityEvent = {
  kind: "community";
  id: string;
  date: Date;
  title: string;
};

export type GameReleaseEvent = {
  kind: "game_release";
  id: string;
  date: Date;
  title: string;
};

export type CalendarEvent = TournamentEvent | ChallengeEvent | CommunityEvent | GameReleaseEvent;

export function eventHref(event: CalendarEvent): string | null {
  if (event.kind === "tournament") return `/tournaments/${event.id}`;
  if (event.kind === "challenge") return `/battles/${event.id}`;
  return null; // community/game_release events have no detail page — the calendar is the whole surface
}

export function eventTitle(event: CalendarEvent): string {
  if (event.kind === "tournament") return event.name;
  if (event.kind === "challenge") return event.game;
  return event.title;
}

/** Tailwind text-color class per kind — Tournament reuses the app's
 *  informational blue, Challenge reuses its established orange (see
 *  OpenChallenges.tsx); Community/Game Release use plain Tailwind
 *  palette colors since Circuit's own accent-token set doesn't have a
 *  dedicated purple/red pair for these two (admin-content) categories. */
export function eventColorClass(event: CalendarEvent): string {
  if (event.kind === "tournament") return "text-accent-blue";
  if (event.kind === "challenge") return "text-accent-orange";
  if (event.kind === "community") return "text-purple-500";
  return "text-rose-500";
}

export function eventDotClass(event: CalendarEvent): string {
  if (event.kind === "tournament") return "bg-accent-blue";
  if (event.kind === "challenge") return "bg-accent-orange";
  if (event.kind === "community") return "bg-purple-500";
  return "bg-rose-500";
}

/** Solid, saturated fill for the month/week grid's compact event chips —
 *  deliberately bolder than the soft-tint badges used elsewhere on
 *  Circuit, so a day cell reads at a glance in a dense grid. */
export function eventPillClass(event: CalendarEvent): string {
  if (event.kind === "tournament") return "bg-accent-blue text-white";
  if (event.kind === "challenge") return "bg-accent-orange text-white";
  if (event.kind === "community") return "bg-purple-500 text-white";
  return "bg-rose-500 text-white";
}
