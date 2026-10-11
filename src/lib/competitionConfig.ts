/**
 * Circuit — turning the game catalog (Admin → Games) into what an
 * organizer can pick when creating a tournament: Game → Mode → Format →
 * Structure, and validating that pick on the server.
 *
 * What's pickable: any active mode and format (team entries since phase 3,
 * lobby modes since phase 4) run as a structure whose engine is built
 * (COMPETITION_STRUCTURES.runnable).
 * Everything else is still shown, marked "coming soon", so organizers
 * see what the game supports.
 *
 * The pure rules live in competitionRules.ts (unit-tested).
 */

import type { CompetitionStyle, EntryType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getStructure } from "@/lib/competitionStructures";
import { describeEntry, describeMatch, entriesPerMatch } from "@/lib/gameCatalog";
import { describePoints, effectiveTable } from "@/lib/lobbyScoring";
import { competitionLabel, formatUnavailable, structureOptions, UNAVAILABLE_LABEL, type PickerGame, type PickerMode } from "@/lib/competitionRules";

export type { PickerFormat, PickerGame, PickerMode } from "@/lib/competitionRules";

// ---------------------------------------------------------------------------

/** Every published game with its active modes and formats, ready for the create/edit form. */
export async function loadOrganizerCatalog(): Promise<PickerGame[]> {
  const games = await prisma.game.findMany({
    where: { enabled: true, publishedAt: { not: null } },
    orderBy: { name: "asc" },
    include: {
      modes: {
        where: { enabled: true },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        include: { formats: { where: { enabled: true }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] } },
      },
    },
  });
  return games.map((g) => {
    const modes: PickerMode[] = g.modes
      .filter((m) => m.formats.length > 0)
      .map((m) => {
        const formats = m.formats.map((f) => ({
          id: f.id,
          name: f.name,
          isDefault: f.isDefault,
          entry: describeEntry(f),
          match: describeMatch(f, m.style),
          defaultRules: f.defaultRules,
          structures: structureOptions(f),
          unavailable: formatUnavailable(m.style, f),
          lobbyCapacity: m.style === "LOBBY" ? entriesPerMatch(f) : null,
          points: m.style === "LOBBY" ? describePoints(effectiveTable(f)) : null,
        }));
        const unavailable = formats.every((f) => f.unavailable) ? (formats[0]?.unavailable ?? "STRUCTURE") : null;
        return { id: m.id, name: m.name, description: m.description, usesFormats: m.usesFormats, style: m.style, formats, unavailable };
      });
    return { id: g.id, name: g.name, iconUrl: g.iconUrl, modes, available: modes.some((m) => !m.unavailable) };
  });
}

export type CompetitionSelection = { gameId?: unknown; gameModeId?: unknown; gameFormatId?: unknown; structure?: unknown };

/** The Tournament columns a valid selection sets. */
export type CompetitionFields = {
  game: string;
  gameId: string;
  gameModeId: string;
  gameFormatId: string;
  modeName: string;
  formatName: string | null;
  competitionStyle: CompetitionStyle;
  entryType: EntryType;
  playersPerTeam: number;
  minRoster: number | null;
  maxRoster: number | null;
  placementPoints: number[];
  killPoints: number;
  teamSize: string;
  format: string;
};

/**
 * Server-side check of an organizer's pick: the game is published, the
 * mode belongs to it, the format to the mode, all active, and the whole
 * combination is runnable today. Returns the columns to store.
 */
export async function resolveCompetition(
  sel: CompetitionSelection
): Promise<{ ok: true; fields: CompetitionFields; defaultRules: string | null; lobbyCapacity: number | null } | { ok: false; error: string }> {
  if (typeof sel.gameId !== "string" || typeof sel.gameModeId !== "string" || typeof sel.gameFormatId !== "string") {
    return { ok: false, error: "Pick a game, mode and format." };
  }
  const format = await prisma.gameFormat.findUnique({
    where: { id: sel.gameFormatId },
    include: { mode: { include: { game: true } } },
  });
  const mode = format?.mode;
  const game = mode?.game;
  if (!format || !mode || !game || mode.id !== sel.gameModeId || game.id !== sel.gameId) {
    return { ok: false, error: "That game mode or format doesn't exist." };
  }
  if (!game.enabled || !game.publishedAt || !mode.enabled || !format.enabled) {
    return { ok: false, error: "That game mode isn't available right now." };
  }
  const blocked = formatUnavailable(mode.style, format);
  if (blocked) return { ok: false, error: `${competitionLabel(mode.name, format)} isn't available yet (${UNAVAILABLE_LABEL[blocked].toLowerCase()}).` };

  const structure = typeof sel.structure === "string" && sel.structure ? sel.structure : format.structures.find((id) => getStructure(id)?.runnable);
  const def = structure ? getStructure(structure) : undefined;
  if (!structure || !def || !format.structures.includes(structure)) return { ok: false, error: "Pick how the competition is run." };
  if (!def.runnable) return { ok: false, error: `${def.label} isn't available yet.` };

  return {
    ok: true,
    defaultRules: format.defaultRules,
    lobbyCapacity: mode.style === "LOBBY" ? entriesPerMatch(format) : null,
    fields: {
      game: game.name,
      gameId: game.id,
      gameModeId: mode.id,
      gameFormatId: format.id,
      modeName: mode.name,
      formatName: format.isDefault ? null : format.name,
      competitionStyle: mode.style,
      entryType: format.entryType,
      playersPerTeam: format.playersPerTeam,
      minRoster: format.entryType === "TEAM" ? format.minRoster : null,
      maxRoster: format.entryType === "TEAM" ? format.maxRoster : null,
      // Lobby scoring is snapshotted so catalog edits don't move a live tournament.
      placementPoints: mode.style === "LOBBY" ? effectiveTable(format).placementPoints.slice() : [],
      killPoints: mode.style === "LOBBY" ? format.killPoints : 1,
      teamSize: competitionLabel(mode.name, format),
      format: structure,
    },
  };
}
