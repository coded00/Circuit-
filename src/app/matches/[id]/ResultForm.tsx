"use client";

/**
 * Circuit — report a match result. Rendered inside the match page's
 * "Report" step (no card of its own). Picking the winner is a choice
 * between the two players as they appear in the head-to-head above;
 * the proof field reminds you the match code must be visible in it,
 * since that's what binds a screenshot to this specific match.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ImageUp } from "lucide-react";
import { Spinner } from "@/components/Spinner";
import { PlayerAvatar } from "@/components/ui/PlayerAvatar";

type PlayerOption = { id: string; displayName: string; handle: string; avatarUrl: string | null };

export default function ResultForm({
  matchId,
  matchCode,
  playerA,
  playerB,
}: {
  matchId: string;
  matchCode: string;
  playerA: PlayerOption;
  playerB: PlayerOption;
}) {
  const router = useRouter();
  const [winnerId, setWinnerId] = useState("");
  const [score, setScore] = useState("");
  const [kills, setKills] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!winnerId) {
      setError("Pick who won.");
      return;
    }
    setError(null);
    setSubmitting(true);

    const form = new FormData(event.currentTarget);
    form.set("winnerId", winnerId);
    form.set("score", score);
    if (kills.trim()) form.set("kills", kills.trim());
    form.set("proofShowsMatchCode", confirmed ? "true" : "false");

    const res = await fetch(`/api/matches/${matchId}/results`, { method: "POST", body: form });
    const data = await res.json().catch(() => null);

    if (!res.ok) {
      setError(data?.error ?? "Something went wrong. Please try again.");
      setSubmitting(false);
      return;
    }

    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <fieldset className="flex flex-col gap-2">
        <legend className="field-label mb-2">Who won?</legend>
        <div className="grid grid-cols-2 gap-3">
          {[playerA, playerB].map((player) => {
            const selected = winnerId === player.id;
            return (
              <button
                key={player.id}
                type="button"
                onClick={() => {
                  setWinnerId(player.id);
                  setError(null);
                }}
                aria-pressed={selected}
                className={`relative flex flex-col items-center gap-2 rounded-[12px] border px-3 py-4 text-center transition duration-[var(--duration-fast)] active:scale-[0.98] ${
                  selected ? "border-accent-volt bg-accent-volt-soft" : "border-border hover:border-border-strong hover:bg-surface-elevated"
                }`}
              >
                {selected && (
                  <span className="absolute top-2 right-2 flex h-5 w-5 items-center justify-center rounded-full bg-accent-volt text-accent-volt-foreground">
                    <Check size={12} strokeWidth={3} />
                  </span>
                )}
                <PlayerAvatar person={player} size="md" />
                <span className="flex min-w-0 max-w-full flex-col">
                  <span className="truncate text-sm font-semibold">{player.displayName}</span>
                  <span className="truncate text-xs text-muted">@{player.handle}</span>
                </span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="score" className="field-label">
            Final score
          </label>
          <input
            id="score"
            required
            placeholder="e.g. 3-1"
            value={score}
            onChange={(e) => setScore(e.target.value)}
            className="field-input font-mono"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="kills" className="field-label">
            Your kills <span className="font-normal text-muted">(optional)</span>
          </label>
          <input
            id="kills"
            type="number"
            min={0}
            step={1}
            placeholder="e.g. 12"
            value={kills}
            onChange={(e) => setKills(e.target.value)}
            className="field-input font-mono"
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="field-label">Proof</span>
        <label
          htmlFor="proof"
          className={`flex cursor-pointer items-center gap-3 rounded-[12px] border border-dashed px-4 py-4 transition hover:bg-surface-elevated ${
            fileName ? "border-success/50" : "border-border-strong"
          }`}
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-surface-elevated text-muted">
            <ImageUp size={18} />
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-medium">{fileName ?? "Upload a screenshot or clip"}</span>
            <span className="text-xs text-muted">
              Must show the final score and code <span className="font-mono font-semibold text-foreground">{matchCode}</span>
            </span>
          </span>
        </label>
        <input
          id="proof"
          name="proof"
          type="file"
          accept="image/*,video/*"
          required
          onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
          className="sr-only"
        />
      </div>

      <label className="flex items-start gap-2.5 text-sm text-muted">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
          required
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-border-strong bg-surface-elevated accent-accent-volt"
        />
        The match code {matchCode} is visible in my proof.
      </label>

      {error && <p className="field-error motion-fade-in">{error}</p>}

      <button type="submit" disabled={submitting} className="btn-primary">
        {submitting && <Spinner />}
        {submitting ? "Submitting…" : "Submit result"}
      </button>
    </form>
  );
}
