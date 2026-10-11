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
  /** The signed-in viewer is registered for it. */
  mine: boolean;
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
  /** A real community's own event links to that community; admin-authored ones have no page. */
  href: string | null;
  /** From a community the signed-in viewer has joined. */
  mine: boolean;
};

/** One of the viewer's own league fixtures, dated by its matchday deadline. */
export type MatchEvent = {
  kind: "match";
  id: string;
  date: Date;
  opponent: string;
  tournamentName: string;
  status: string;
};

export type GameReleaseEvent = {
  kind: "game_release";
  id: string;
  date: Date;
  title: string;
};

export type CalendarEvent = TournamentEvent | ChallengeEvent | CommunityEvent | GameReleaseEvent | MatchEvent;

export function eventHref(event: CalendarEvent): string | null {
  if (event.kind === "tournament") return `/tournaments/${event.id}`;
  if (event.kind === "challenge") return `/battles/${event.id}`;
  if (event.kind === "match") return `/matches/${event.id}`;
  if (event.kind === "community") return event.href;
  return null; // game releases have no detail page — the calendar is the whole surface
}

export function eventTitle(event: CalendarEvent): string {
  if (event.kind === "tournament") return event.name;
  if (event.kind === "challenge") return `${event.game} challenge`;
  if (event.kind === "match") return `vs ${event.opponent}`;
  return event.title;
}

export type EventKind = CalendarEvent["kind"];

/**
 * One colour per kind, all from Circuit's own accent tokens (the old
 * Tailwind purple-500/rose-500 pair sat outside the palette): Tournament
 * = Competition Blue, Challenge = Challenge Orange, Community = Volt,
 * Game Release = ink. Exposed as a CSS value so the grid's event rows,
 * dots and the filter chips (which double as the legend) all read the
 * same `--ev` custom property — see `.cal-event` in globals.css.
 */
export const EVENT_KIND_META: Record<EventKind, { label: string; plural: string; color: string }> = {
  tournament: { label: "Tournament", plural: "Tournaments", color: "var(--accent-blue)" },
  challenge: { label: "Challenge", plural: "Challenges", color: "var(--accent-orange)" },
  community: { label: "Community", plural: "Community", color: "var(--accent-volt)" },
  game_release: { label: "Game release", plural: "Game Releases", color: "var(--foreground)" },
  match: { label: "Your match", plural: "Your matches", color: "var(--accent-orange)" },
};

export function eventColor(event: CalendarEvent): string {
  return EVENT_KIND_META[event.kind].color;
}

export function formatEventTime(date: Date): string {
  return date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

/** Admin-authored Community/Game Release rows are often date-only
 *  (stored at midnight) — those read "All day" rather than "00:00". */
export function eventTimeLabel(event: CalendarEvent): string {
  const allDay = (event.kind === "community" || event.kind === "game_release") && event.date.getHours() === 0 && event.date.getMinutes() === 0;
  return allDay ? "All day" : formatEventTime(event.date);
}
