"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ImageUrlField, POSTER_BOUNDS } from "@/components/ImageUrlField";
import { gameFormatOptions } from "@/lib/gameFormats";
import { defaultRulesFor } from "@/lib/gameRules";

function nairaToKobo(value: string): number {
  const naira = Number(value || 0);
  return Math.round(naira * 100);
}

export default function TournamentForm({
  redirectBase,
  games,
}: {
  // A plain path prefix, not a function — Server Component callers
  // (e.g. the admin page) can't pass functions as props to this Client
  // Component.
  redirectBase?: string;
  games: { id: string; name: string }[];
} = { games: [] }) {
  const router = useRouter();

  const [name, setName] = useState("");
  const [game, setGame] = useState(games[0]?.name ?? "");
  const modeOptions = gameFormatOptions(game);
  const [teamSize, setTeamSize] = useState(modeOptions[0]);
  const [participantCap, setParticipantCap] = useState("16");
  const [entryFeeNaira, setEntryFeeNaira] = useState("0");
  const [prizeAmountNaira, setPrizeAmountNaira] = useState("");
  const [prizeText, setPrizeText] = useState("");
  const [rulesText, setRulesText] = useState("");
  const [streamUrl, setStreamUrl] = useState("");
  const [enableCommunity, setEnableCommunity] = useState(true);
  const [posterUrl, setPosterUrl] = useState("");
  const [posterBlocked, setPosterBlocked] = useState(false);
  const [registrationOpenAt, setRegistrationOpenAt] = useState("");
  const [registrationCloseAt, setRegistrationCloseAt] = useState("");
  const [startAt, setStartAt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
        game,
        teamSize,
        participantCap: Number(participantCap),
        entryFee: nairaToKobo(entryFeeNaira),
        prizeAmount: prizeAmountNaira ? nairaToKobo(prizeAmountNaira) : null,
        prizeText: prizeText || null,
        rulesText,
        streamUrl: streamUrl || null,
        enableCommunity,
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

    router.push(redirectBase ? `${redirectBase}/${data.id}` : `/tournaments/${data.id}`);
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

      <div className="flex flex-col gap-1.5">
        <label htmlFor="game" className="field-label">
          Game
        </label>
        <select
          id="game"
          required
          value={game}
          onChange={(e) => {
            const nextGame = e.target.value;
            setGame(nextGame);
            // Re-pick a valid mode for the newly-selected game's real
            // options (e.g. Valorant's 5v5-only modes vs. Fortnite's
            // BR/Zero Build sizes) — never leaves teamSize holding a
            // value that isn't actually one of the new game's options.
            const nextModes = gameFormatOptions(nextGame);
            if (!nextModes.includes(teamSize)) setTeamSize(nextModes[0]);
          }}
          className="field-input"
        >
          {games.length === 0 && <option value="">No games available — ask an admin to add one</option>}
          {games.map((g) => (
            <option key={g.id} value={g.name}>
              {g.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1 rounded-[10px] border border-border bg-surface-elevated px-3.5 py-2.5">
        <span className="text-sm font-medium">Format</span>
        <span className="field-hint">
          Single-elimination knockout — the only format Circuit supports in V1.
        </span>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="teamSize" className="field-label">
          Game mode
        </label>
        <select
          id="teamSize"
          value={teamSize}
          onChange={(e) => setTeamSize(e.target.value)}
          className="field-input"
        >
          {modeOptions.map((mode) => (
            <option key={mode} value={mode}>
              {mode}
            </option>
          ))}
        </select>
        <span className="field-hint">
          The real modes {game || "this game"} actually runs. Participants still register
          individually; coordinate teams outside Circuit.
        </span>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="participantCap" className="field-label">
          Participant cap
        </label>
        <input
          id="participantCap"
          type="number"
          min={2}
          max={128}
          required
          value={participantCap}
          onChange={(e) => setParticipantCap(e.target.value)}
          className="field-input"
        />
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
              onClick={() => setRulesText(defaultRulesFor(game))}
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

      <div className="flex flex-col gap-1.5">
        <label htmlFor="streamUrl" className="field-label">
          Stream link (optional)
        </label>
        <input
          id="streamUrl"
          type="url"
          placeholder="https://twitch.tv/yourchannel"
          value={streamUrl}
          onChange={(e) => setStreamUrl(e.target.value)}
          className="field-input"
        />
        <span className="field-hint">Shown as a &quot;Watch stream&quot; link on the tournament page.</span>
      </div>

      <label className="flex items-start gap-2.5 rounded-[10px] border border-border bg-surface-elevated px-3.5 py-3">
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

      <ImageUrlField
        label="Tournament poster (optional)"
        value={posterUrl}
        onChange={setPosterUrl}
        onValidityChange={setPosterBlocked}
        bounds={POSTER_BOUNDS}
      />

      {error && <p className="field-error">{error}</p>}

      <button type="submit" disabled={submitting || posterBlocked} className="btn-primary">
        {submitting ? "Creating…" : "Create tournament"}
      </button>
    </form>
  );
}
