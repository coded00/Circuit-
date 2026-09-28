"use client";

/**
 * Circuit — the interactive bits of a lobby tournament's standings page:
 * flagging a round, answering or escalating a flag, and finalising.
 * All rules are re-checked server-side (src/lib/lobby.ts).
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Flag, KeyRound } from "lucide-react";

async function send(url: string, method: string, body?: unknown): Promise<string | null> {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  if (res.ok) return null;
  const data = await res.json().catch(() => null);
  return data?.error ?? "Something went wrong. Please try again.";
}

export function FlagRoundForm({ tournamentId, roundNumber, roundLabel }: { tournamentId: string; roundNumber: number; roundLabel: string }) {
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
        What&apos;s wrong with {roundLabel.replace(/^Round/, "round")}?
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

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      <span className="text-eyebrow text-muted">{label}</span>
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch {
            /* clipboard blocked — the value is still visible to copy by hand */
          }
        }}
        className="flex h-10 items-center justify-between gap-2 rounded-[10px] border border-border bg-surface px-3 text-left font-mono text-sm font-semibold transition hover:border-border-hover"
        aria-label={`Copy ${label.toLowerCase()}`}
      >
        <span className="truncate select-all">{value}</span>
        {copied ? <Check size={14} className="shrink-0 text-success" /> : <Copy size={14} className="shrink-0 text-muted" />}
      </button>
    </div>
  );
}

/** What entrants see: the room to join for a round. */
export function RoomDetailsCard({ roundLabel, roomCode, roomPassword }: { roundLabel: string; roomCode: string | null; roomPassword: string | null }) {
  if (!roomCode) {
    return (
      <p className="flex items-center gap-2 rounded-[10px] border border-dashed border-border px-3 py-2.5 text-xs text-muted">
        <KeyRound size={14} /> Room details for {roundLabel.replace(/^Round/, "round")} aren&apos;t posted yet — you&apos;ll get a notification.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-2 rounded-[12px] border border-accent-volt/40 bg-accent-volt/5 p-3">
      <span className="flex items-center gap-2 text-xs font-semibold">
        <KeyRound size={14} /> {roundLabel} room — only players in this lobby can see this
      </span>
      <div className="flex flex-col gap-2 sm:flex-row">
        <CopyField label="Room ID" value={roomCode} />
        {roomPassword && <CopyField label="Password" value={roomPassword} />}
      </div>
    </div>
  );
}

/** Organizer/staff: post, change or clear a round's room. */
export function RoomDetailsForm({
  tournamentId,
  roundNumber,
  roundLabel,
  roomCode,
  roomPassword,
  hasLaterRounds,
}: {
  tournamentId: string;
  roundNumber: number;
  roundLabel: string;
  roomCode: string | null;
  roomPassword: string | null;
  hasLaterRounds: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(!roomCode);
  const [code, setCode] = useState(roomCode ?? "");
  const [password, setPassword] = useState(roomPassword ?? "");
  const [allRemaining, setAllRemaining] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(next: { roomCode: string; roomPassword: string }) {
    setBusy(true);
    setError(null);
    const err = await send(`/api/tournaments/${tournamentId}/rounds/${roundNumber}/room`, "PUT", { ...next, allRemaining });
    setBusy(false);
    if (err) return setError(err);
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <div className="flex flex-col gap-2">
        {roomCode && <RoomDetailsCard roundLabel={roundLabel} roomCode={roomCode} roomPassword={roomPassword} />}
        <button type="button" onClick={() => setOpen(true)} className="inline-flex w-fit items-center gap-1.5 text-xs font-semibold text-muted hover:text-foreground">
          <KeyRound size={13} /> {roomCode ? "Change room details" : "Post room details"}
        </button>
      </div>
    );
  }
  return (
    <form
      className="flex flex-col gap-2 rounded-[12px] border border-border p-3"
      onSubmit={(e) => {
        e.preventDefault();
        save({ roomCode: code, roomPassword: password });
      }}
    >
      <span className="flex items-center gap-2 text-xs font-semibold">
        <KeyRound size={14} /> {roundLabel} room
      </span>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <input value={code} onChange={(e) => setCode(e.target.value)} maxLength={60} required placeholder="Room ID" aria-label="Room ID" className="field-input h-9 font-mono text-sm" />
        <input value={password} onChange={(e) => setPassword(e.target.value)} maxLength={60} placeholder="Password (optional)" aria-label="Room password" className="field-input h-9 font-mono text-sm" />
      </div>
      {hasLaterRounds && (
        <label className="flex items-center gap-2 text-xs text-muted">
          <input type="checkbox" checked={allRemaining} onChange={(e) => setAllRemaining(e.target.checked)} className="accent-[var(--accent-volt)]" />
          Use the same room for this lobby&apos;s later rounds
        </label>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={busy} className="btn-primary h-8 px-3 text-xs">
          {busy ? "Saving…" : "Share with players"}
        </button>
        {roomCode && (
          <button type="button" disabled={busy} onClick={() => save({ roomCode: "", roomPassword: "" })} className="btn-secondary h-8 px-3 text-xs">
            Clear
          </button>
        )}
        {roomCode && (
          <button type="button" onClick={() => setOpen(false)} className="btn-secondary h-8 px-3 text-xs">
            Cancel
          </button>
        )}
      </div>
      <p className="text-[11px] text-muted">Only confirmed players (and roster players) see this. They&apos;re notified when you share it.</p>
    </form>
  );
}

/** Organizer: end the group stage and send the top of each group to the final. */
export function StartFinalButton({ tournamentId, blocker, finalists }: { tournamentId: string; blocker: string | null; finalists: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-2">
      {confirming ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm">Lock the group results and send {finalists} finalists through? Group results can&apos;t change after this.</p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError(null);
                const err = await send(`/api/tournaments/${tournamentId}/final`, "POST");
                setBusy(false);
                if (err) return setError(err);
                setConfirming(false);
                router.refresh();
              }}
              className="btn-primary h-9 flex-1 text-sm"
            >
              {busy ? "Starting…" : "Yes, start the final"}
            </button>
            <button type="button" onClick={() => setConfirming(false)} className="btn-secondary h-9 px-3 text-sm">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button type="button" disabled={!!blocker} onClick={() => setConfirming(true)} className="btn-primary h-10 w-full text-sm">
          Start the final
        </button>
      )}
      {(error ?? blocker) && <p className={`text-xs ${error ? "text-danger" : "text-muted"}`}>{error ?? blocker}</p>}
    </div>
  );
}
