/**
 * Circuit — when a page is worth indexing. A page with almost nothing on it is thin content, so each kind of entity
 * page only asks search engines to index it once there's real activity behind it. Below the bar the page still works
 * for people; it carries noindex and stays out of the sitemap, and flips on its own once the numbers are reached.
 */

/** A game page: three public tournaments, or one finished tournament with a real field. */
export function gameIsIndexable(stats: { publicTournaments: number; completedWithEightEntrants: number }): boolean {
  return stats.publicTournaments >= 3 || stats.completedWithEightEntrants >= 1;
}

export const MIN_RANKED_PLAYERS = 10;

/** A leaderboard: ten ranked players. */
export function leaderboardIsIndexable(rankedPlayers: number): boolean {
  return rankedPlayers >= MIN_RANKED_PLAYERS;
}

/** A team page: at least two accepted members and at least one tournament entry. */
export function teamIsIndexable(stats: { acceptedMembers: number; tournamentEntries: number }): boolean {
  return stats.acceptedMembers >= 2 && stats.tournamentEntries >= 1;
}

/** A country page: three public tournaments from the country, and ten players who live there. */
export function countryIsIndexable(stats: { publicTournaments: number; players: number }): boolean {
  return stats.publicTournaments >= 3 && stats.players >= 10;
}

/** A game in a country: three public tournaments of that game from that country. */
export function gameCountryIsIndexable(publicTournaments: number): boolean {
  return publicTournaments >= 3;
}
