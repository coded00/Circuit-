/**
 * Circuit — shared view-transition names. A name must be unique on a page
 * (a duplicate makes the browser skip the transition), so each surface
 * that shows a tournament's art decides whether to claim it — see
 * TournamentCard's `morph` prop.
 */

export function tournamentArtName(tournamentId: string): string {
  return `tournament-art-${tournamentId}`;
}
