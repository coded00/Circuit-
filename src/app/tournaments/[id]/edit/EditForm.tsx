"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Tournament } from "@prisma/client";

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
}: {
  tournament: Tournament;
  moneyFieldsLocked: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState(tournament.name);
  const [game, setGame] = useState(tournament.game);
  const [participantCap, setParticipantCap] = useState(String(tournament.participantCap));
  const [entryFeeNaira, setEntryFeeNaira] = useState(String(tournament.entryFee / 100));
  const [prizeAmountNaira, setPrizeAmountNaira] = useState(
    tournament.prizeAmount ? String(tournament.prizeAmount / 100) : ""
  );
  const [prizeText, setPrizeText] = useState(tournament.prizeText ?? "");
  const [rulesText, setRulesText] = useState(tournament.rulesText ?? "");
  const [streamUrl, setStreamUrl] = useState(tournament.streamUrl ?? "");
  const [registrationOpenAt, setRegistrationOpenAt] = useState(toLocalInput(tournament.registrationOpenAt));
  const [registrationCloseAt, setRegistrationCloseAt] = useState(toLocalInput(tournament.registrationCloseAt));
  const [startAt, setStartAt] = useState(toLocalInput(tournament.startAt));
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    const body: Record<string, unknown> = {
      name,
      game,
      participantCap: Number(participantCap),
      prizeText: prizeText || null,
      rulesText,
      streamUrl: streamUrl || null,
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

    router.push(`/tournaments/${tournament.id}`);
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
        <input
          id="game"
          required
          value={game}
          onChange={(e) => setGame(e.target.value)}
          className="field-input"
        />
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

      <div className="flex flex-col gap-1.5">
        <label htmlFor="rulesText" className="field-label">
          Rules
        </label>
        <textarea
          id="rulesText"
          required
          rows={5}
          value={rulesText}
          onChange={(e) => setRulesText(e.target.value)}
          className="field-textarea"
        />
      </div>

      {error && <p className="field-error">{error}</p>}

      <button type="submit" disabled={submitting} className="btn-primary">
        {submitting ? "Saving…" : "Save changes"}
      </button>
    </form>
  );
}
