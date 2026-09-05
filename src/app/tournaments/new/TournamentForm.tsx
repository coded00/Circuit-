"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const inputClass = "field-input";
const labelClass = "field-label";
const fieldClass = "flex flex-col gap-1.5";

function nairaToKobo(value: string): number {
  const naira = Number(value || 0);
  return Math.round(naira * 100);
}

export default function TournamentForm() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [game, setGame] = useState("");
  const [participantCap, setParticipantCap] = useState("16");
  const [entryFeeNaira, setEntryFeeNaira] = useState("0");
  const [prizeAmountNaira, setPrizeAmountNaira] = useState("");
  const [prizeText, setPrizeText] = useState("");
  const [rulesText, setRulesText] = useState("");
  const [streamUrl, setStreamUrl] = useState("");
  const [registrationOpenAt, setRegistrationOpenAt] = useState("");
  const [registrationCloseAt, setRegistrationCloseAt] = useState("");
  const [startAt, setStartAt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    const res = await fetch("/api/tournaments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        game,
        participantCap: Number(participantCap),
        entryFee: nairaToKobo(entryFeeNaira),
        prizeAmount: prizeAmountNaira ? nairaToKobo(prizeAmountNaira) : null,
        prizeText: prizeText || null,
        rulesText,
        streamUrl: streamUrl || null,
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

    router.push(`/tournaments/${data.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <div className={fieldClass}>
        <label htmlFor="name" className={labelClass}>
          Tournament name
        </label>
        <input
          id="name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={inputClass}
        />
      </div>

      <div className={fieldClass}>
        <label htmlFor="game" className={labelClass}>
          Game
        </label>
        <input
          id="game"
          required
          placeholder="e.g. EA FC 26"
          value={game}
          onChange={(e) => setGame(e.target.value)}
          className={inputClass}
        />
      </div>

      <div className={fieldClass}>
        <span className={labelClass}>Format</span>
        <span className="text-sm text-muted">
          Single-elimination knockout — the only format Circuit supports in V1.
        </span>
      </div>

      <div className={fieldClass}>
        <label htmlFor="participantCap" className={labelClass}>
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
          className={inputClass}
        />
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        <div className={fieldClass}>
          <label htmlFor="registrationOpenAt" className={labelClass}>
            Registration opens
          </label>
          <input
            id="registrationOpenAt"
            type="datetime-local"
            required
            value={registrationOpenAt}
            onChange={(e) => setRegistrationOpenAt(e.target.value)}
            className={inputClass}
          />
        </div>
        <div className={fieldClass}>
          <label htmlFor="registrationCloseAt" className={labelClass}>
            Registration closes
          </label>
          <input
            id="registrationCloseAt"
            type="datetime-local"
            required
            value={registrationCloseAt}
            onChange={(e) => setRegistrationCloseAt(e.target.value)}
            className={inputClass}
          />
        </div>
        <div className={fieldClass}>
          <label htmlFor="startAt" className={labelClass}>
            Start date
          </label>
          <input
            id="startAt"
            type="datetime-local"
            required
            value={startAt}
            onChange={(e) => setStartAt(e.target.value)}
            className={inputClass}
          />
        </div>
      </div>

      <div className={fieldClass}>
        <label htmlFor="entryFeeNaira" className={labelClass}>
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
          className={inputClass}
        />
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div className={fieldClass}>
          <label htmlFor="prizeAmountNaira" className={labelClass}>
            Prize amount (₦, optional)
          </label>
          <input
            id="prizeAmountNaira"
            type="number"
            min={0}
            step="0.01"
            value={prizeAmountNaira}
            onChange={(e) => setPrizeAmountNaira(e.target.value)}
            className={inputClass}
          />
        </div>
        <div className={fieldClass}>
          <label htmlFor="prizeText" className={labelClass}>
            Prize description (optional)
          </label>
          <input
            id="prizeText"
            placeholder="e.g. Winner takes all + bragging rights"
            value={prizeText}
            onChange={(e) => setPrizeText(e.target.value)}
            className={inputClass}
          />
        </div>
      </div>

      <div className={fieldClass}>
        <label htmlFor="rulesText" className={labelClass}>
          Rules
        </label>
        <textarea
          id="rulesText"
          required
          rows={5}
          value={rulesText}
          onChange={(e) => setRulesText(e.target.value)}
          className={inputClass}
        />
      </div>

      <div className={fieldClass}>
        <label htmlFor="streamUrl" className={labelClass}>
          Stream link (optional)
        </label>
        <input
          id="streamUrl"
          type="url"
          placeholder="https://twitch.tv/yourchannel"
          value={streamUrl}
          onChange={(e) => setStreamUrl(e.target.value)}
          className={inputClass}
        />
        <span className="text-xs text-muted">Shown as a &quot;Watch stream&quot; link on the tournament page.</span>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      <button type="submit" disabled={submitting} className="btn-primary w-full">
        {submitting ? "Creating…" : "Create tournament"}
      </button>
    </form>
  );
}
