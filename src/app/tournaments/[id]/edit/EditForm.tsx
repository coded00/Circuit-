"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Tournament } from "@prisma/client";
import { ImageUploadField, POSTER_BOUNDS } from "@/components/ImageUploadField";
import { gameFormatOptions } from "@/lib/gameFormats";
import { defaultRulesFor } from "@/lib/gameRules";

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
  games,
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
  games: { id: string; name: string }[];
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
  const [game, setGame] = useState(tournament.game);
  const [teamSize, setTeamSize] = useState(tournament.teamSize);
  const [participantCap, setParticipantCap] = useState(String(tournament.participantCap));
  const [entryFeeNaira, setEntryFeeNaira] = useState(String(tournament.entryFee / 100));
  const [prizeAmountNaira, setPrizeAmountNaira] = useState(
    tournament.prizeAmount ? String(tournament.prizeAmount / 100) : ""
  );
  const [prizeText, setPrizeText] = useState(tournament.prizeText ?? "");
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
      game,
      teamSize,
      participantCap: Number(participantCap),
      prizeText: prizeText || null,
      rulesText,
      streamUrl: streamUrl || null,
      posterUrl: posterUrl || null,
      registrationOpenAt: new Date(registrationOpenAt).toISOString(),
      registrationCloseAt: new Date(registrationCloseAt).toISOString(),
      startAt: new Date(startAt).toISOString(),
    };
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

    router.push(redirectTo ?? `/tournaments/${tournament.id}`);
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
            // Only re-pick a mode here (a real, organizer-driven game
            // change) — never on initial mount, which would otherwise
            // clobber this tournament's own already-saved, possibly
            // now-nonstandard mode the instant the page loads.
            const nextModes = gameFormatOptions(nextGame);
            if (!nextModes.includes(teamSize)) setTeamSize(nextModes[0]);
          }}
          className="field-input"
        >
          {/* The tournament's current game might not be an active catalog entry (renamed/disabled since) — keep it selectable so saving doesn't silently change it. */}
          {!games.some((g) => g.name === game) && game && <option value={game}>{game}</option>}
          {games.map((g) => (
            <option key={g.id} value={g.name}>
              {g.name}
            </option>
          ))}
        </select>
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
          {/* This tournament might already be running a mode outside the
              current game's curated list (an older tournament predating
              this, or the game catalog entry changed since) — keep it
              selectable rather than silently swapping it out. */}
          {!gameFormatOptions(game).includes(teamSize) && teamSize && <option value={teamSize}>{teamSize}</option>}
          {gameFormatOptions(game).map((mode) => (
            <option key={mode} value={mode}>
              {mode}
            </option>
          ))}
        </select>
        <span className="field-hint">The real modes {game || "this game"} actually runs.</span>
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

      {error && <p className="field-error">{error}</p>}

      <button type="submit" disabled={submitting || posterBlocked} className="btn-primary">
        {submitting ? "Saving…" : "Save changes"}
      </button>
    </form>
  );
}
