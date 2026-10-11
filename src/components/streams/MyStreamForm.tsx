"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { StreamPlatform } from "@prisma/client";
import { EMPTY_STREAM, StreamFields, type StreamValue } from "@/components/streams/StreamFields";
import type { SelectablePlatform } from "@/lib/streams";

/** A registered player adds, changes or removes their own stream for this tournament. */
export function MyStreamForm({ tournamentId, current }: { tournamentId: string; current: { platform: StreamPlatform | null; platformName: string | null; url: string | null } }) {
  const router = useRouter();
  const has = !!current.url;
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState<StreamValue>({
    platform: (current.platform && current.platform !== "CIRCUIT" ? current.platform : EMPTY_STREAM.platform) as SelectablePlatform,
    platformName: current.platformName ?? "",
    url: current.url ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(next: StreamValue) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/tournaments/${tournamentId}/my-stream`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ platform: next.platform, platformName: next.platform === "OTHER" ? next.platformName : null, url: next.url }),
    });
    const data = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) {
      setError(data?.error ?? "Couldn't save your stream.");
      return;
    }
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn-secondary w-fit text-xs">
        {has ? "Change your stream" : "Add your stream"}
      </button>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted">Let viewers watch your matches live.</p>
      <StreamFields idPrefix="my-stream" value={value} onChange={setValue} />
      {error && <p className="field-error">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy || !value.url.trim()} onClick={() => save(value)} className="btn-primary text-xs">
          {busy ? "Saving…" : "Save stream"}
        </button>
        {has && (
          <button type="button" disabled={busy} onClick={() => save({ ...value, url: "" })} className="btn-secondary text-xs">
            Remove it
          </button>
        )}
        <button type="button" disabled={busy} onClick={() => setOpen(false)} className="btn-secondary text-xs">
          Cancel
        </button>
      </div>
    </div>
  );
}
