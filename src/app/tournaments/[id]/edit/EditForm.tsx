"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Tournament } from "@prisma/client";
import { ImageUploadField, POSTER_BOUNDS } from "@/components/ImageUploadField";
import { defaultRulesFor } from "@/lib/gameRules";
import type { PickerGame } from "@/lib/competitionRules";
import { getStructure } from "@/lib/competitionStructures";
import { PrizeSplitField } from "@/components/PrizeSplitField";
import { maxPrizePlaces } from "@/lib/prizes";
import { CompetitionPicker, DEFAULT_ROUNDS, defaultCompetition, selectedParts, type CompetitionValue } from "@/components/CompetitionPicker";

function toLocalInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function nairaToKobo(value: string): number {
  return Math.round(Number(value || 0) * 100);
}

export default function EditForm({
  tournament,
  moneyFieldsLocked,
  redirectTo,
  catalog,
  competitionLocked,
  communityEnabled: initialCommunityEnabled,
}: {
  tournament: Tournament;
  moneyFieldsLocked: boolean;
  /** Where a successful save sends the editor — defaults to the public
   *  tournament page (the organizer's own flow). The admin edit page
   *  passes its own detail page instead, so a save keeps the admin
   *  inside the control center rather than dropping them into the
   *  player-facing app. */
  redirectTo?: string;
  /** Published games with their modes/formats (loadOrganizerCatalog). */
  catalog: PickerGame[];
  /** Someone has registered: the game/mode/format can no longer change. */
  competitionLocked: boolean;
  /** "Enable/disable from tournament settings" — this edit form is
   *  Circuit Community Phase 1's only settings surface today. Note this
   *  page itself redirects once registration closes (see its own page.tsx),
   *  so toggling from here only covers the pre-close window; a LIVE
   *  tournament's community can't be disabled mid-run yet. */
  communityEnabled: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState(tournament.name);
  const [communityEnabled, setCommunityEnabled] = useState(initialCommunityEnabled);
  // The tournament's own config, if it still exists in the catalog. Older
  // tournaments (pre-catalog) show their saved label until changed.
  const original: CompetitionValue | null =
    tournament.gameId && tournament.gameModeId && tournament.gameFormatId
      ? {
          gameId: tournament.gameId,
          gameModeId: tournament.gameModeId,
          gameFormatId: tournament.gameFormatId,
          structure: tournament.format,
          lobbyRounds: String(tournament.lobbyRounds ?? DEFAULT_ROUNDS),
          lobbyGroups: tournament.lobbyGroups ? String(tournament.lobbyGroups) : "",
          lobbyQualifiers: tournament.lobbyQualifiers ? String(tournament.lobbyQualifiers) : "",
          lobbyFinalRounds: tournament.lobbyFinalRounds ? String(tournament.lobbyFinalRounds) : "",
          leagueWinPoints: String(tournament.leagueWinPoints ?? 3),
          leagueAllowDraws: tournament.format !== "LEAGUE" || tournament.leagueDrawPoints != null,
          leagueDrawPoints: String(tournament.leagueDrawPoints ?? 1),
          leagueLegs: String(tournament.leagueLegs ?? 1),
          leagueMatchdayDays: String(tournament.leagueMatchdayDays ?? 7),
        }
      : null;
  const originalInCatalog = !!original && !!selectedParts(catalog, original).format;
  const [competition, setCompetition] = useState<CompetitionValue | null>(originalInCatalog ? original : null);
  const { format: selectedFormat } = competition ? selectedParts(catalog, competition) : { format: undefined };
  const structureMax = selectedFormat?.structures.find((x) => x.id === (competition?.structure ?? tournament.format))?.maxEntries ?? null;
  const groupCount = Number(competition?.lobbyGroups) >= 2 ? Number(competition?.lobbyGroups) : 1;
  const capLimit = selectedFormat?.lobbyCapacity ? selectedFormat.lobbyCapacity * groupCount : (structureMax ?? 128);
  const game = (competition && selectedParts(catalog, competition).game?.name) || tournament.game;
  const competitionChanged =
    !!competition &&
    (!original || competition.gameFormatId !== original.gameFormatId || competition.structure !== original.structure || competition.gameId !== original.gameId);
  // Lobby rounds stay editable after people register, until the lobby starts.
  const isLobby = (selectedFormat ? selectedParts(catalog, competition!).mode?.style : tournament.competitionStyle) === "LOBBY";
  const roundsEditable = tournament.status !== "LIVE" && tournament.status !== "COMPLETE";
  const [lockedRounds, setLockedRounds] = useState(String(tournament.lobbyRounds ?? DEFAULT_ROUNDS));
  const competitionInvalid = competitionChanged && (!selectedFormat || !!selectedFormat.unavailable || !competition?.structure);
  const [participantCap, setParticipantCap] = useState(String(tournament.participantCap));
  const [entryFeeNaira, setEntryFeeNaira] = useState(String(tournament.entryFee / 100));
  const [prizeAmountNaira, setPrizeAmountNaira] = useState(
    tournament.prizeAmount ? String(tournament.prizeAmount / 100) : ""
  );
  const [prizeText, setPrizeText] = useState(tournament.prizeText ?? "");
  const [prizeSplit, setPrizeSplit] = useState<number[]>(tournament.prizeSplit);
  const [splitBlocked, setSplitBlocked] = useState(false);
  const prizeKobo = prizeAmountNaira ? nairaToKobo(prizeAmountNaira) : 0;
  const splitStructure = competition?.structure ?? tournament.format;
  const groupsForSplit = Number(competition?.lobbyGroups ?? tournament.lobbyGroups) || 0;
  const qualifiersForSplit = Number(competition?.lobbyQualifiers ?? tournament.lobbyQualifiers) || 0;
  const splitMaxPlaces = maxPrizePlaces(splitStructure, Number(participantCap) || 2, groupsForSplit >= 2 ? groupsForSplit * qualifiersForSplit : null);
  const splitTooLong = prizeKobo > 0 && prizeSplit.length > splitMaxPlaces;
  const [rulesText, setRulesText] = useState(tournament.rulesText ?? "");
  const [streamUrl, setStreamUrl] = useState(tournament.streamUrl ?? "");
  const [posterUrl, setPosterUrl] = useState(tournament.posterUrl ?? "");
  const [posterBlocked, setPosterBlocked] = useState(false);
  const [registrationOpenAt, setRegistrationOpenAt] = useState(toLocalInput(tournament.registrationOpenAt));
  const [registrationCloseAt, setRegistrationCloseAt] = useState(toLocalInput(tournament.registrationCloseAt));
  const [startAt, setStartAt] = useState(toLocalInput(tournament.startAt));
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (posterBlocked) return;
    setError(null);
    setSubmitting(true);

    const body: Record<string, unknown> = {
      name,
      ...(competitionChanged ? competition : {}),
      ...(!competitionChanged && isLobby && roundsEditable
        ? {
            lobbyRounds: competition && !competitionLocked ? competition.lobbyRounds : lockedRounds,
            ...(competition && !competitionLocked
              ? { lobbyGroups: competition.lobbyGroups, lobbyQualifiers: competition.lobbyQualifiers, lobbyFinalRounds: competition.lobbyFinalRounds }
              : {}),
          }
        : {}),
      ...(!competitionChanged && competition?.structure === "LEAGUE" && !competitionLocked && roundsEditable
        ? {
            leagueWinPoints: competition.leagueWinPoints,
            leagueAllowDraws: competition.leagueAllowDraws,
            leagueDrawPoints: competition.leagueDrawPoints,
            leagueLegs: competition.leagueLegs,
            leagueMatchdayDays: competition.leagueMatchdayDays,
          }
        : {}),
      participantCap: Number(participantCap),
      prizeText: prizeText || null,
      rulesText,
      streamUrl: streamUrl || null,
      posterUrl: posterUrl || null,
      registrationOpenAt: new Date(registrationOpenAt).toISOString(),
      registrationCloseAt: new Date(registrationCloseAt).toISOString(),
      startAt: new Date(startAt).toISOString(),
    };
    if (!competitionLocked && prizeSplit.join() !== tournament.prizeSplit.join()) body.prizeSplit = prizeSplit;
    if (!moneyFieldsLocked) {
      body.entryFee = nairaToKobo(entryFeeNaira);
      body.prizeAmount = prizeAmountNaira ? nairaToKobo(prizeAmountNaira) : null;
    }

    const res = await fetch(`/api/tournaments/${tournament.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => null);

    if (!res.ok) {
      setError(data?.error ?? "Something went wrong. Please try again.");
      setSubmitting(false);
      return;
    }

    if (communityEnabled !== initialCommunityEnabled) {
      await fetch(`/api/tournaments/${tournament.id}/community`, {
        method: communityEnabled ? "POST" : "PATCH",
      });
    }

    router.replace(redirectTo ?? `/tournaments/${tournament.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="name" className="field-label">
          Tournament name
        </label>
        <input
          id="name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="field-input"
        />
      </div>

      {competition && !competitionLocked ? (
        <CompetitionPicker catalog={catalog} value={competition} onChange={setCompetition} />
      ) : (
        <div className="flex flex-col gap-1.5">
          <span className="field-label">Game &amp; format</span>
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-[10px] border border-border bg-surface-elevated px-3.5 py-3">
            <span className="text-sm">
              <span className="font-semibold">{tournament.game}</span> · {tournament.teamSize} · {getStructure(tournament.format)?.label ?? tournament.format}
            </span>
            {!competitionLocked && catalog.length > 0 && (
              <button
                type="button"
                onClick={() => setCompetition(defaultCompetition(catalog, catalog.find((g) => g.name.toLowerCase() === tournament.game.toLowerCase())?.id))}
                className="text-sm font-semibold text-accent-blue hover:underline"
              >
                Change
              </button>
            )}
          </div>
          <span className="field-hint">
            {competitionLocked
              ? "Locked — players have already registered for this game and format."
              : "Saved before the game catalog existed. Change it to pick from the current modes and formats."}
          </span>
          {tournament.format === "LEAGUE" && (
            <span className="field-hint">
              League: {tournament.leagueWinPoints ?? 3} for a win{tournament.leagueDrawPoints != null ? `, ${tournament.leagueDrawPoints} for a draw` : ", no draws"} · {tournament.leagueLegs === 2 ? "home and away" : "played once"} ·{" "}
              a matchday every {tournament.leagueMatchdayDays ?? 7} days.
            </span>
          )}
          {tournament.competitionStyle === "LOBBY" && roundsEditable && (
            <label className="mt-2 flex w-40 flex-col gap-1.5">
              <span className="field-label">Rounds</span>
              <input
                id="lobbyRounds"
                type="number"
                min={1}
                max={20}
                required
                value={lockedRounds}
                onChange={(e) => setLockedRounds(e.target.value)}
                className="field-input"
              />
            </label>
          )}
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="participantCap" className="field-label">
          Participant cap
        </label>
        <input
          id="participantCap"
          type="number"
          min={2}
          max={capLimit}
          required
          value={participantCap}
          onChange={(e) => setParticipantCap(e.target.value)}
          className="field-input"
        />
        {selectedFormat?.lobbyCapacity ? (
          <span className="field-hint">
            {groupCount > 1 ? `${groupCount} group lobbies hold up to ${capLimit} entries.` : `One lobby holds up to ${selectedFormat.lobbyCapacity} entries.`}
          </span>
        ) : structureMax ? (
          <span className="field-hint">
            {["ROUND_ROBIN", "LEAGUE"].includes(competition?.structure ?? tournament.format)
              ? `Up to ${structureMax} entries — every pairing is a match (${(structureMax * (structureMax - 1)) / 2} matches at ${structureMax}).`
              : `Up to ${structureMax} entries.`}
          </span>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="registrationOpenAt" className="field-label">
            Registration opens
          </label>
          <input
            id="registrationOpenAt"
            type="datetime-local"
            required
            value={registrationOpenAt}
            onChange={(e) => setRegistrationOpenAt(e.target.value)}
            className="field-input"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="registrationCloseAt" className="field-label">
            Registration closes
          </label>
          <input
            id="registrationCloseAt"
            type="datetime-local"
            required
            value={registrationCloseAt}
            onChange={(e) => setRegistrationCloseAt(e.target.value)}
            className="field-input"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="startAt" className="field-label">
            Start date
          </label>
          <input
            id="startAt"
            type="datetime-local"
            required
            value={startAt}
            onChange={(e) => setStartAt(e.target.value)}
            className="field-input"
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="entryFeeNaira" className="field-label">
          Entry fee (₦, 0 for free)
        </label>
        <input
          id="entryFeeNaira"
          type="number"
          min={0}
          step="0.01"
          required
          disabled={moneyFieldsLocked}
          value={entryFeeNaira}
          onChange={(e) => setEntryFeeNaira(e.target.value)}
          className="field-input"
        />
        {moneyFieldsLocked && (
          <span className="field-hint">
            Locked — a paid registration already exists for this tournament.
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="prizeAmountNaira" className="field-label">
            Prize amount (₦, optional)
          </label>
          <input
            id="prizeAmountNaira"
            type="number"
            min={0}
            step="0.01"
            disabled={moneyFieldsLocked}
            value={prizeAmountNaira}
            onChange={(e) => setPrizeAmountNaira(e.target.value)}
            className="field-input"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="prizeText" className="field-label">
            Prize description (optional)
          </label>
          <input
            id="prizeText"
            value={prizeText}
            onChange={(e) => setPrizeText(e.target.value)}
            className="field-input"
          />
        </div>
      </div>

      {prizeKobo > 0 && (
        <PrizeSplitField
          value={prizeSplit}
          onChange={setPrizeSplit}
          maxPlaces={splitMaxPlaces}
          prizeAmount={prizeKobo}
          knockout={splitStructure === "KNOCKOUT"}
          locked={competitionLocked}
          onValidityChange={setSplitBlocked}
        />
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="streamUrl" className="field-label">
          Stream link (optional)
        </label>
        <input
          id="streamUrl"
          type="url"
          value={streamUrl}
          onChange={(e) => setStreamUrl(e.target.value)}
          className="field-input"
        />
      </div>

      <ImageUploadField
        purpose="poster"
        label="Tournament poster (optional)"
        value={posterUrl}
        onChange={setPosterUrl}
        onValidityChange={setPosterBlocked}
        bounds={POSTER_BOUNDS}
      />

      <label className="flex items-start gap-2.5 rounded-[10px] border border-border bg-surface-elevated px-3.5 py-3">
        <input
          type="checkbox"
          checked={communityEnabled}
          onChange={(e) => setCommunityEnabled(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-border-strong bg-surface accent-accent-blue"
        />
        <span className="flex flex-col gap-0.5">
          <span className="text-sm font-medium">Enable Community</span>
          <span className="field-hint">
            A chat space attached to this tournament — general, announcements, matches, and results channels.
          </span>
        </span>
      </label>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <label htmlFor="rulesText" className="field-label">
            Rules
          </label>
          {!rulesText && (
            <button
              type="button"
              onClick={() => setRulesText(selectedFormat?.defaultRules || defaultRulesFor(game))}
              className="text-xs font-medium text-accent-blue hover:underline"
            >
              Use suggested rules for {game || "this game"}
            </button>
          )}
        </div>
        <textarea
          id="rulesText"
          required
          rows={5}
          placeholder="e.g. Bo3, screenshot the final scoreboard as proof, no exploits or third-party cheats…"
          value={rulesText}
          onChange={(e) => setRulesText(e.target.value)}
          className="field-textarea"
        />
      </div>

      {error && <p className="field-error">{error}</p>}

      <button type="submit" disabled={submitting || posterBlocked || competitionInvalid || splitBlocked || (!competitionLocked && splitTooLong)} className="btn-primary">
        {submitting ? "Saving…" : "Save changes"}
      </button>
    </form>
  );
}
