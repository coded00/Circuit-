/**
 * Circuit — the pure rules for what an organizer can pick from the game
 * catalog (no database access, safe in client components). The server
 * side — loading the catalog and validating a pick — is competitionConfig.ts.
 */

import type { CompetitionStyle, EntryType } from "@prisma/client";
import { COMPETITION_STRUCTURES, getStructure } from "@/lib/competitionStructures";

export type Unavailable = "STRUCTURE";

export const UNAVAILABLE_LABEL: Record<Unavailable, string> = {
  STRUCTURE: "Coming soon",
};

type FormatLike = { entryType: EntryType; structures: string[] };
// entryType and style stay in the signature: team formats (phase 3) and
// lobby modes (phase 4) are pickable now, but callers still pass them.

/** Why a format can't be picked yet, or null if it can. */
export function formatUnavailable(_style: CompetitionStyle, format: FormatLike): Unavailable | null {
  if (!format.structures.some((id) => getStructure(id)?.runnable)) return "STRUCTURE";
  return null;
}

/** The structures a format offers, in registry order, with whether each can be run yet. */
export function structureOptions(format: { structures: string[] }) {
  return COMPETITION_STRUCTURES.filter((s) => format.structures.includes(s.id)).map((s) => ({
    id: s.id,
    label: s.label,
    description: s.description,
    runnable: s.runnable,
    maxEntries: s.maxEntries ?? null,
  }));
}

/** Tournament.teamSize label: "Search & Destroy · 1v1", or just the mode for modes without formats. */
export function competitionLabel(modeName: string, format: { name: string; isDefault: boolean }): string {
  return format.isDefault ? modeName : `${modeName} · ${format.name}`;
}


export type PickerFormat = {
  id: string;
  name: string;
  isDefault: boolean;
  entry: string;
  match: string;
  defaultRules: string | null;
  structures: ReturnType<typeof structureOptions>;
  unavailable: Unavailable | null;
  /** LOBBY formats: most entries one lobby holds (caps the tournament), and the scoring summary. */
  lobbyCapacity: number | null;
  points: string | null;
};
export type PickerMode = { id: string; name: string; description: string | null; usesFormats: boolean; style: CompetitionStyle; formats: PickerFormat[]; unavailable: Unavailable | null };
export type PickerGame = { id: string; name: string; iconUrl: string | null; modes: PickerMode[]; available: boolean };

