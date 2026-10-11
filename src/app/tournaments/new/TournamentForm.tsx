"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ImageUploadField, POSTER_BOUNDS } from "@/components/ImageUploadField";
import { defaultRulesFor } from "@/lib/gameRules";
import type { PickerGame } from "@/lib/competitionRules";
import { CompetitionPicker, defaultCompetition, selectedParts } from "@/components/CompetitionPicker";
import { PrizeSplitField } from "@/components/PrizeSplitField";
import { maxPrizePlaces } from "@/lib/prizes";
import { StreamFields, StreamModePicker, EMPTY_STREAM, type StreamValue } from "@/components/streams/StreamFields";
import { modeHasTournamentStream, type SelectablePlatform } from "@/lib/streams";
import type { StreamMode } from "@prisma/client";

function nairaToKobo(value: string): number {
  const naira = Number(value || 0);
  return Math.round(naira * 100);
}

export default function TournamentForm({
  redirectBase,
  catalog,
  hostCommunities = [],
  defaultHostCommunityId = "",
}: {
  // A plain path prefix, not a function — Server Component callers
  // (e.g. the admin page) can't pass functions as props to this Client
  // Component.
  redirectBase?: string;
  /** Published games with their modes/formats (loadOrganizerCatalog). */
  catalog: PickerGame[];
  /** Communities they run — the tournament can be one of their events. */
  hostCommunities?: { id: string; name: string | null }[];
  defaultHostCommunityId?: string;
} = { catalog: [] }) {
  const [hostCommunityId, setHostCommunityId] = useState(
    hostCommunities.some((c) => c.id === defaultHostCommunityId) ? defaultHostCommunityId : ""
  );
  const router = useRouter();

  const [name, setName] = useState("");
  const [competition, setCompetition] = useState(() => defaultCompetition(catalog));
  const { game: selectedGame, format: selectedFormat } = selectedParts(catalog, competition);
  const structureMax = selectedFormat?.structures.find((x) => x.id === competition.structure)?.maxEntries ?? null;
  const groupCount = Number(competition.lobbyGroups) >= 2 ? Number(competition.lobbyGroups) : 1;
  const capLimit = selectedFormat?.lobbyCapacity ? selectedFormat.lobbyCapacity * groupCount : (structureMax ?? 128);
  const game = selectedGame?.name ?? "";
  const canCreate = !!selectedFormat && !selectedFormat.unavailable && !!competition.structure;
  const [participantCap, setParticipantCap] = useState("16");
  const [entryFeeNaira, setEntryFeeNaira] = useState("0");
  const [prizeAmountNaira, setPrizeAmountNaira] = useState("");
  const [prizeText, setPrizeText] = useState("");
  const [prizeSplit, setPrizeSplit] = useState<number[]>([]);
  const [splitBlocked, setSplitBlocked] = useState(false);
  const prizeKobo = prizeAmountNaira ? nairaToKobo(prizeAmountNaira) : 0;
  const finalistCount = Number(competition.lobbyGroups) >= 2 ? Number(competition.lobbyGroups) * (Number(competition.lobbyQualifiers) || 0) : null;
  const splitTooLong = prizeKobo > 0 && prizeSplit.length > maxPrizePlaces(competition.structure, Number(participantCap) || 2, finalistCount);
  const [rulesText, setRulesText] = useState("");
  const [streamMode, setStreamMode] = useState<StreamMode>("TOURNAMENT_AND_PLAYERS");
  const [stream, setStream] = useState<StreamValue>(EMPTY_STREAM);
  const [enableCommunity, setEnableCommunity] = useState(true);
  const [posterUrl, setPosterUrl] = useState("");
  const [posterBlocked, setPosterBlocked] = useState(false);
  const [registrationOpenAt, setRegistrationOpenAt] = useState("");
  const [registrationCloseAt, setRegistrationCloseAt] = useState("");
  const [startAt, setStartAt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // A lobby format caps the tournament at one lobby's worth of entries.
  function pickCompetition(next: typeof competition) {
    setCompetition(next);
    const format = selectedParts(catalog, next).format;
    const groupsNext = Number(next.lobbyGroups) >= 2 ? Number(next.lobbyGroups) : 1;
    const capacity = format?.lobbyCapacity ? format.lobbyCapacity * groupsNext : format?.structures.find((x) => x.id === next.structure)?.maxEntries;
    if (capacity && Number(participantCap) > capacity) setParticipantCap(String(capacity));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (posterBlocked) return;
    setError(null);
    setSubmitting(true);

    const res = await fetch("/api/tournaments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        ...competition,
        participantCap: Number(participantCap),
        entryFee: nairaToKobo(entryFeeNaira),
        prizeAmount: prizeAmountNaira ? nairaToKobo(prizeAmountNaira) : null,
        prizeText: prizeText || null,
        prizeSplit: prizeKobo > 0 ? prizeSplit : [],
        rulesText,
        streamMode,
        streamPlatform: stream.platform,
        streamPlatformName: stream.platform === "OTHER" ? stream.platformName : null,
        streamUrl: stream.url || null,
        enableCommunity,
        hostCommunityId: hostCommunityId || null,
        posterUrl: posterUrl || null,
        registrationOpenAt: registrationOpenAt
          ? new Date(registrationOpenAt).toISOString()
          : null,
        registrationCloseAt: registrationCloseAt
          ? new Date(registrationCloseAt).toISOString()
          : null,
        startAt: startAt ? new Date(startAt).toISOString() : null,
      }),
    });

    const data = await res.json().catch(() => null);

    if (!res.ok) {
      setError(data?.error ?? "Something went wrong. Please try again.");
      setSubmitting(false);
      return;
    }

    // replace: Back shouldn't reopen a form that was already submitted.
    router.replace(redirectBase ? `${redirectBase}/${data.id}` : `/tournaments/${data.id}`);
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

      <CompetitionPicker catalog={catalog} value={competition} onChange={pickCompetition} />

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
            {["ROUND_ROBIN", "LEAGUE"].includes(competition.structure)
              ? `Up to ${structureMax} entries. Every pairing is a match (${(structureMax * (structureMax - 1)) / 2} matches at ${structureMax}).`
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
          value={entryFeeNaira}
          onChange={(e) => setEntryFeeNaira(e.target.value)}
          className="field-input"
        />
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
            placeholder="e.g. Winner takes all + bragging rights"
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
          maxPlaces={maxPrizePlaces(competition.structure, Number(participantCap) || 2, finalistCount)}
          prizeAmount={prizeKobo}
          knockout={competition.structure === "KNOCKOUT"}
          onValidityChange={setSplitBlocked}
        />
      )}

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <label htmlFor="rulesText" className="field-label">
            Rules
          </label>
          {/* Only offered while the field is still blank — a quick-fill
              suggestion, not an overwrite tool, so it can never clobber
              rules the organizer already wrote. */}
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

      <div className="flex flex-col gap-4 border-t border-border pt-5">
        <StreamModePicker idPrefix="stream-mode" value={streamMode} onChange={setStreamMode} />
        {modeHasTournamentStream(streamMode) && (
          <div className="flex flex-col gap-2">
            <span className="text-sm font-semibold">Tournament stream</span>
            <StreamFields idPrefix="tournament-stream" value={stream} onChange={setStream} hint="You can leave this empty for now and add it later when you edit the tournament." />
          </div>
        )}
        {streamMode === "TOURNAMENT_AND_PLAYERS" || streamMode === "PLAYERS_ONLY" ? (
          <span className="field-hint">Players will be able to add their own channel when they register.</span>
        ) : null}
      </div>

      {hostCommunities.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="hostCommunity" className="field-label">
            Host as a community event (optional)
          </label>
          <select id="hostCommunity" value={hostCommunityId} onChange={(e) => setHostCommunityId(e.target.value)} className="field-select">
            <option value="">Not a community event</option>
            {hostCommunities.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <span className="field-hint">It&apos;s announced in the community and listed under its events.</span>
        </div>
      )}

      <label className="flex items-start gap-2.5 rounded-none border border-border bg-surface-elevated px-3.5 py-3">
        <input
          type="checkbox"
          checked={enableCommunity}
          onChange={(e) => setEnableCommunity(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-border-strong bg-surface accent-accent-blue"
        />
        <span className="flex flex-col gap-0.5">
          <span className="text-sm font-medium">Enable Community</span>
          <span className="field-hint">
            Gives players a chat space attached to this tournament — general, announcements, matches, and results
            channels. You can turn this off later from Edit.
          </span>
        </span>
      </label>

      <ImageUploadField
        purpose="poster"
        label="Tournament poster (optional)"
        value={posterUrl}
        onChange={setPosterUrl}
        onValidityChange={setPosterBlocked}
        bounds={POSTER_BOUNDS}
      />

      {error && <p className="field-error">{error}</p>}

      <button type="submit" disabled={submitting || posterBlocked || !canCreate || splitBlocked || splitTooLong} className="btn-primary">
        {submitting ? "Creating…" : "Create tournament"}
      </button>
    </form>
  );
}
