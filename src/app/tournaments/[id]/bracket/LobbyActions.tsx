"use client";

/**
 * Circuit — the interactive bits of a lobby tournament's standings page:
 * flagging a round, answering or escalating a flag, and finalising.
 * All rules are re-checked server-side (src/lib/lobby.ts).
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Flag } from "lucide-react";

async function send(url: string, method: string, body?: unknown): Promise<string | null> {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  if (res.ok) return null;
  const data = await res.json().catch(() => null);
  return data?.error ?? "Something went wrong. Please try again.";
}

export function FlagRoundForm({ tournamentId, roundNumber }: { tournamentId: string; roundNumber: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted transition hover:text-foreground">
        <Flag size={13} /> Flag a problem
      </button>
    );
  }
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        const err = await send(`/api/tournaments/${tournamentId}/rounds/${roundNumber}/flags`, "POST", { reason });
        setBusy(false);
        if (err) return setError(err);
        setOpen(false);
        setReason("");
        router.refresh();
      }}
    >
      <label htmlFor={`flag-${roundNumber}`} className="field-label">
        What&apos;s wrong with round {roundNumber}?
      </label>
      <textarea
        id={`flag-${roundNumber}`}
        rows={3}
        required
        minLength={10}
        maxLength={1000}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="e.g. We finished 2nd, not 5th — we had 7 kills. Screenshot in the tournament chat."
        className="field-textarea text-sm"
      />
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={busy} className="btn-primary h-9 px-4 text-sm">
          {busy ? "Sending…" : "Send to organizer"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="btn-secondary h-9 px-4 text-sm">
          Cancel
        </button>
      </div>
    </form>
  );
}

/** Organizer/staff: resolve or dismiss. The flag's own player: escalate. */
export function FlagAnswer({ flagId, canAnswer, canEscalate }: { flagId: string; canAnswer: boolean; canEscalate: boolean }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function act(action: "resolve" | "dismiss" | "escalate") {
    setBusy(true);
    setError(null);
    const err = await send(`/api/lobby-flags/${flagId}`, "PATCH", { action, note });
    setBusy(false);
    if (err) return setError(err);
    router.refresh();
  }

  if (!canAnswer && !canEscalate) return null;
  return (
    <div className="flex flex-col gap-2">
      {canAnswer && (
        <>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={1000}
            placeholder="Your answer (required to dismiss)"
            aria-label="Answer to the flag"
            className="field-input h-9 text-sm"
          />
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={() => act("resolve")} className="btn-primary h-8 px-3 text-xs">
              Corrected — resolve
            </button>
            <button type="button" disabled={busy} onClick={() => act("dismiss")} className="btn-secondary h-8 px-3 text-xs">
              Results stand — dismiss
            </button>
          </div>
        </>
      )}
      {canEscalate && (
        <button type="button" disabled={busy} onClick={() => act("escalate")} className="btn-secondary h-8 w-fit px-3 text-xs">
          Take it to Circuit staff
        </button>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}

export function FinaliseButton({ tournamentId, blocker }: { tournamentId: string; blocker: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-2">
      {confirming ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm">Finalise the results? The leader wins and results can&apos;t be changed after this.</p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError(null);
                const err = await send(`/api/tournaments/${tournamentId}/finalise`, "POST");
                setBusy(false);
                if (err) return setError(err);
                setConfirming(false);
                router.refresh();
              }}
              className="btn-primary h-9 flex-1 text-sm"
            >
              {busy ? "Finalising…" : "Yes, finalise"}
            </button>
            <button type="button" onClick={() => setConfirming(false)} className="btn-secondary h-9 px-3 text-sm">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button type="button" disabled={!!blocker} onClick={() => setConfirming(true)} className="btn-primary h-10 w-full text-sm">
          Finalise results
        </button>
      )}
      {(error ?? blocker) && <p className={`text-xs ${error ? "text-danger" : "text-muted"}`}>{error ?? blocker}</p>}
    </div>
  );
}
