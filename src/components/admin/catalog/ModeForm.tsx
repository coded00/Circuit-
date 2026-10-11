"use client";

/**
 * Circuit — create/edit a game mode. The format-layer toggle decides the
 * shape: with it on, formats are added separately under the mode; with it
 * off, the mode's single player/team configuration is edited right here.
 */

import { useId, useState } from "react";
import type { CompetitionStyle } from "@prisma/client";
import type { CatalogMode } from "@/lib/gameCatalog";
import { FormatFields, draftFromFormat, emptyFormatDraft, formatDraftBody, type FormatDraft } from "./FormatFields";
import { Switch, catalogRequest } from "./shared";

const STYLES: { value: CompetitionStyle; label: string; hint: string }[] = [
  { value: "HEAD_TO_HEAD", label: "Head-to-head", hint: "Two sides per match, played in a bracket" },
  { value: "LOBBY", label: "Lobby", hint: "Many entries share a lobby, ranked by placement" },
];

export function ModeForm({ gameId, mode, onDone }: { gameId: string; mode?: CatalogMode; onDone: (changed: boolean) => void }) {
  const uid = useId();
  const defaultFormat = mode?.formats.find((f) => f.isDefault) ?? (mode && !mode.usesFormats ? mode.formats[0] : undefined);
  const [name, setName] = useState(mode?.name ?? "");
  const [description, setDescription] = useState(mode?.description ?? "");
  const [style, setStyle] = useState<CompetitionStyle>(mode?.style ?? "HEAD_TO_HEAD");
  const [usesFormats, setUsesFormats] = useState(mode?.usesFormats ?? true);
  const [format, setFormat] = useState<FormatDraft>(() => (defaultFormat ? draftFromFormat(defaultFormat) : emptyFormatDraft(mode?.style ?? "HEAD_TO_HEAD")));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Style can't change under named formats (their lobby/structure settings
  // would stop making sense) — the server enforces the same rule.
  const styleLocked = !!mode && mode.usesFormats && mode.formats.length > 0;

  function changeStyle(next: CompetitionStyle) {
    setStyle(next);
    const fresh = emptyFormatDraft(next);
    setFormat((f) => ({ ...f, structures: fresh.structures, maxPlayersPerMatch: fresh.maxPlayersPerMatch, teamsPerMatch: "" }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const body = { name, description, style, usesFormats, ...(usesFormats ? {} : { format: formatDraftBody({ ...format, name }) }) };
    const err = mode
      ? await catalogRequest("PATCH", `/api/admin/game-modes/${mode.id}`, body)
      : await catalogRequest("POST", `/api/admin/games/${gameId}/modes`, body);
    setSaving(false);
    if (err) return setError(err);
    onDone(true);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-[12px] border border-border-strong bg-surface p-4 sm:p-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="field-label">Mode name</span>
          <input required autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Battle Royale" className="field-input" />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="field-label">Description <span className="text-muted">(optional)</span></span>
          <input value={description} onChange={(e) => setDescription(e.target.value)} className="field-input" />
        </label>
      </div>

      <fieldset className="flex flex-col gap-2" disabled={styleLocked}>
        <legend className="field-label mb-1.5">How it&apos;s contested</legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {STYLES.map((s) => (
            <label
              key={s.value}
              className={`flex cursor-pointer flex-col gap-0.5 rounded-[10px] border p-3 transition ${
                style === s.value ? "border-foreground bg-surface-elevated" : "border-border hover:border-border-hover"
              } ${styleLocked ? "cursor-not-allowed opacity-60" : ""}`}
            >
              <input type="radio" name={`${uid}-style`} className="sr-only" checked={style === s.value} onChange={() => changeStyle(s.value)} />
              <span className="text-sm font-semibold">{s.label}</span>
              <span className="text-xs text-muted">{s.hint}</span>
            </label>
          ))}
        </div>
        {styleLocked && <p className="field-hint">Remove this mode&apos;s formats to change how it&apos;s contested.</p>}
      </fieldset>

      <div className="flex items-start justify-between gap-4 rounded-[10px] border border-border p-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-semibold">Separate formats</span>
          <span className="text-xs text-muted">
            {usesFormats
              ? "Add named formats under this mode (e.g. Solo, Duo, Squad)."
              : "This mode has one configuration. Set its player and team rules below."}
          </span>
        </div>
        <Switch checked={usesFormats} onChange={setUsesFormats} label="Separate formats" />
      </div>

      {!usesFormats && (
        <div className="border-t border-border pt-4">
          <FormatFields value={format} onChange={setFormat} style={style} hideName idPrefix={uid} />
        </div>
      )}

      {error && <p className="field-error">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={saving} className="btn-primary text-sm">
          {saving ? "Saving…" : mode ? "Save mode" : "Add mode"}
        </button>
        <button type="button" onClick={() => onDone(false)} className="btn-ghost text-sm">
          Cancel
        </button>
      </div>
    </form>
  );
}
