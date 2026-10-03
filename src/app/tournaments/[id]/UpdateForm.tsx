"use client";

/** The organizer's box for posting an update. Everyone entered is notified. */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Megaphone } from "lucide-react";
import { Spinner } from "@/components/Spinner";
import { useToast } from "@/components/ToastProvider";
import { MAX_UPDATE_LENGTH } from "@/lib/tournamentUpdateRules";

export default function UpdateForm({ tournamentId, entrants }: { tournamentId: string; entrants: number }) {
  const router = useRouter();
  const toast = useToast();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function post(event: React.FormEvent) {
    event.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    setError(null);
    let res: Response;
    try {
      res = await fetch(`/api/tournaments/${tournamentId}/updates`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body }) });
    } catch {
      setError("We couldn't reach Circuit, so nothing was posted. Check your connection and try again.");
      setBusy(false);
      return;
    }
    if (!res.ok) {
      setError((await res.json().catch(() => null))?.error ?? "Something went wrong. Please try again.");
      setBusy(false);
      return;
    }
    setBody("");
    setBusy(false);
    toast({ title: "Update posted", message: entrants > 0 ? `${entrants} ${entrants === 1 ? "player was" : "players were"} notified.` : undefined });
    router.refresh();
  }

  return (
    <form onSubmit={post} className="flex flex-col gap-2.5 border-t border-border px-5 py-4">
      <label htmlFor="update-body" className="field-label flex items-center gap-1.5">
        <Megaphone size={14} aria-hidden /> Post an update
      </label>
      <textarea
        id="update-body"
        rows={3}
        maxLength={MAX_UPDATE_LENGTH}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Room details, a schedule change, a reminder…"
        className="field-input resize-none"
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-muted tabular-nums">
          {body.length}/{MAX_UPDATE_LENGTH} · {entrants === 0 ? "nobody is entered yet" : `${entrants} ${entrants === 1 ? "player" : "players"} will be notified`}
        </span>
        <button type="submit" disabled={busy || !body.trim()} className="btn-primary gap-2">
          {busy && <Spinner />}
          {busy ? "Posting…" : "Post update"}
        </button>
      </div>
      {error && <p className="field-error">{error}</p>}
    </form>
  );
}
