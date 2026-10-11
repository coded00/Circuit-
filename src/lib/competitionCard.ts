/** The fields TournamentCard needs, shared by the pages that list tournaments (game, country, game + country). */
export const competitionCardSelect = {
  id: true,
  name: true,
  game: true,
  status: true,
  format: true,
  teamSize: true,
  entryFee: true,
  participantCap: true,
  registrationOpenAt: true,
  posterUrl: true,
  startAt: true,
  prizeAmount: true,
  _count: { select: { registrations: { where: { status: "CONFIRMED" as const } } } },
} as const;

export const PUBLIC_TOURNAMENT_STATUSES = ["OPEN", "CLOSED", "LIVE", "COMPLETE"] as const;
