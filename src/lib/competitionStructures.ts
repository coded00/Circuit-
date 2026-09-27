/**
 * Circuit — the competition structures a GameFormat can be run as.
 *
 * This is the one list that has to live in code: each structure needs a
 * real engine (bracket generation, standings, result flow) behind it.
 * Which structures a given format *allows* is admin data
 * (GameFormat.structures); this registry only says which structures exist,
 * which contest style they suit, and whether their engine is built yet.
 *
 * `KNOCKOUT` keeps the id Tournament.format has always stored for single
 * elimination, so existing tournaments map onto it with no data change.
 */

import type { CompetitionStyle } from "@prisma/client";

export type CompetitionStructure = {
  id: string;
  label: string;
  description: string;
  style: CompetitionStyle;
  /** False = admins can offer it, organizers see it as "coming soon". */
  runnable: boolean;
};

export const COMPETITION_STRUCTURES: readonly CompetitionStructure[] = [
  {
    id: "KNOCKOUT",
    label: "Single elimination",
    description: "Lose once and you're out.",
    style: "HEAD_TO_HEAD",
    runnable: true,
  },
  {
    id: "DOUBLE_ELIMINATION",
    label: "Double elimination",
    description: "A second life through a losers' bracket.",
    style: "HEAD_TO_HEAD",
    runnable: false,
  },
  {
    id: "ROUND_ROBIN",
    label: "Round robin",
    description: "Every entry plays every other entry.",
    style: "HEAD_TO_HEAD",
    runnable: false,
  },
  {
    id: "SWISS",
    label: "Swiss",
    description: "Fixed rounds, paired against similar records.",
    style: "HEAD_TO_HEAD",
    runnable: false,
  },
  {
    id: "LEAGUE",
    label: "League",
    description: "A season of fixtures with a standings table.",
    style: "HEAD_TO_HEAD",
    runnable: false,
  },
  {
    id: "LOBBY_POINTS",
    label: "Lobby points",
    description: "One lobby plays several rounds, scored by placement and kills.",
    style: "LOBBY",
    runnable: true,
  },
];

export function getStructure(id: string): CompetitionStructure | undefined {
  return COMPETITION_STRUCTURES.find((s) => s.id === id);
}

export function structuresForStyle(style: CompetitionStyle): CompetitionStructure[] {
  return COMPETITION_STRUCTURES.filter((s) => s.style === style);
}
