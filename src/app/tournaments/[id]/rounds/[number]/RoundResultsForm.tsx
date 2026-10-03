"use client";

/**
 * Circuit — the organizer's results sheet for one lobby round: a place
 * and kills for every entry (a blank place = didn't play), with the
 * points each earns shown live. The server re-validates everything
 * (validateRoundResults in src/lib/lobbyScoring.ts).
 */

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDownWideNarrow } from "lucide-react";
import { ImageUploadField } from "@/components/ImageUploadField";
import { pointsFor, type PointsTable } from "@/lib/lobbyScoring";

type Entry = { registrationId: string; name: string; tag: string | null; sub: string; inGameId: string | null };
type Row = { placement: string; kills: string };

export function RoundResultsForm({
  tournamentId,
  roundNumber,
  table,
  entries,
  initial,
  initialProofUrl,
  backHref,
  openFlags,
}: {
  tournamentId: string;
  roundNumber: number;
  table: PointsTable;
  entries: Entry[];
  initial: { registrationId: string; placement: number | null; kills: number }[];
  initialProofUrl: string | null;
  backHref: string;
  openFlags: number;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<Record<string, Row>>(() => {
    const byId = new Map(initial.map((r) => [r.registrationId, r]));
    return Object.fromEntries(
      entries.map((e) => {
        const r = byId.get(e.registrationId);
        return [e.registrationId, { placement: r?.placement ? String(r.placement) : "", kills: r && r.placement ? String(r.kills) : "" }];
      })
    );
  });
  const [order, setOrder] = useState(() => {
    const byId = new Map(initial.map((r) => [r.registrationId, r.placement ?? 999]));
    return [...entries].sort((a, b) => (byId.get(a.registrationId) ?? 999) - (byId.get(b.registrationId) ?? 999)).map((e) => e.registrationId);
  });
  const [proofUrl, setProofUrl] = useState(initialProofUrl ?? "");
  const [proofBlocked, setProofBlocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const entryById = new Map(entries.map((e) => [e.registrationId, e]));

  const duplicates = useMemo(() => {
    const count = new Map<string, number>();
    for (const r of Object.values(rows)) if (r.placement) count.set(r.placement, (count.get(r.placement) ?? 0) + 1);
    return new Set([...count].filter(([, n]) => n > 1).map(([p]) => p));
  }, [rows]);
  const placed = Object.values(rows).filter((r) => r.placement).length;
  const set = (id: string, key: keyof Row, value: string) => setRows((prev) => ({ ...prev, [id]: { ...prev[id], [key]: value } }));

  function sortByPlace() {
    setOrder((prev) => [...prev].sort((a, b) => (Number(rows[a].placement) || 999) - (Number(rows[b].placement) || 999)));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/tournaments/${tournamentId}/rounds/${roundNumber}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        proofUrl: proofUrl || null,
        results: order.map((id) => ({
          registrationId: id,
          placement: rows[id].placement ? Number(rows[id].placement) : null,
          kills: rows[id].placement ? Number(rows[id].kills || 0) : 0,
        })),
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error ?? "Couldn't save the results. Please try again.");
      setBusy(false);
      return;
    }
    router.replace(backHref);
    router.refresh();
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-5">
      {openFlags > 0 && (
        <p className="rounded-none border border-dashed border-border-strong px-4 py-3 text-sm">
          {openFlags} flag{openFlags === 1 ? " is" : "s are"} waiting on this round. After correcting, resolve {openFlags === 1 ? "it" : "them"} on the Rounds tab.
        </p>
      )}
      <div className="flex items-center justify-between gap-2">
        <span className={`font-mono text-xs ${duplicates.size ? "text-danger" : "text-muted"}`}>
          {duplicates.size ? `Two entries share ${[...duplicates].map((p) => `#${p}`).join(", ")}` : `${placed} of ${entries.length} placed · leave the place blank if an entry didn't play`}
        </span>
        <button type="button" onClick={sortByPlace} className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted hover:text-foreground">
          <ArrowDownWideNarrow size={14} /> Sort by place
        </button>
      </div>
      <ul className="card flex flex-col divide-y divide-border p-0">
        <li className="text-eyebrow hidden grid-cols-[1fr_5rem_5rem_3.5rem] gap-3 px-4 py-2 text-muted sm:grid">
          <span>Entry</span>
          <span>Place</span>
          <span>Kills</span>
          <span className="text-right">Pts</span>
        </li>
        {order.map((id) => {
          const entry = entryById.get(id)!;
          const row = rows[id];
          const place = row.placement ? Number(row.placement) : null;
          const pts = place ? pointsFor(place, Number(row.kills) || 0, table) : 0;
          return (
            <li key={id} className="grid grid-cols-[1fr_4.5rem_4.5rem_3rem] items-center gap-2 px-4 py-2.5 sm:grid-cols-[1fr_5rem_5rem_3.5rem] sm:gap-3">
              <div className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-semibold">
                  {entry.name}
                  {entry.tag && <span className="ml-1 font-mono text-[11px] text-muted">[{entry.tag}]</span>}
                </span>
                <span className="text-metadata truncate">
                  {entry.sub}
                  {entry.inGameId ? ` · ${entry.inGameId}` : ""}
                </span>
              </div>
              <input
                type="number"
                min={1}
                max={entries.length}
                inputMode="numeric"
                value={row.placement}
                onChange={(e) => set(id, "placement", e.target.value)}
                aria-label={`${entry.name} place`}
                placeholder="—"
                className={`field-input h-9 px-2 text-center font-mono text-sm ${row.placement && duplicates.has(row.placement) ? "border-danger" : ""}`}
              />
              <input
                type="number"
                min={0}
                max={999}
                inputMode="numeric"
                value={row.kills}
                disabled={!row.placement}
                onChange={(e) => set(id, "kills", e.target.value)}
                aria-label={`${entry.name} kills`}
                placeholder="0"
                className="field-input h-9 px-2 text-center font-mono text-sm disabled:opacity-40"
              />
              <span className="text-right font-mono text-sm font-bold tabular-nums">{place ? pts : "–"}</span>
            </li>
          );
        })}
      </ul>

      <ImageUploadField
        label="Results screenshot (optional)"
        value={proofUrl}
        onChange={setProofUrl}
        onValidityChange={setProofBlocked}
        purpose="banner"
        hint="The end-of-game scoreboard. Players can check it against what you entered."
      />

      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={busy || proofBlocked || placed === 0 || duplicates.size > 0} className="btn-primary flex-1">
          {busy ? "Saving…" : initial.length ? "Save corrections" : "Post results"}
        </button>
        <button type="button" onClick={() => router.push(backHref)} className="btn-secondary px-5">
          Cancel
        </button>
      </div>
      <p className="field-hint">Players are notified when a round&apos;s results are first posted. You can correct them until you finalise.</p>
    </form>
  );
}
