"use client";

import { useId, useState } from "react";
import type { CompetitionStyle } from "@prisma/client";
import type { CatalogFormat } from "@/lib/gameCatalog";
import { FormatFields, draftFromFormat, emptyFormatDraft, formatDraftBody } from "./FormatFields";
import { catalogRequest } from "./shared";

/** Circuit — create/edit one named format under a mode. */
export function FormatForm({
  modeId,
  style,
  format,
  onDone,
}: {
  modeId: string;
  style: CompetitionStyle;
  format?: CatalogFormat;
  onDone: (changed: boolean) => void;
}) {
  const uid = useId();
  const [draft, setDraft] = useState(() => (format ? draftFromFormat(format) : emptyFormatDraft(style)));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const body = formatDraftBody(draft);
    const err = format
      ? await catalogRequest("PATCH", `/api/admin/game-formats/${format.id}`, body)
      : await catalogRequest("POST", `/api/admin/game-modes/${modeId}/formats`, body);
    setSaving(false);
    if (err) return setError(err);
    onDone(true);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-[12px] border border-border-strong bg-background/50 p-4">
      <FormatFields value={draft} onChange={setDraft} style={style} idPrefix={uid} />
      {error && <p className="field-error">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={saving} className="btn-primary px-4 py-2 text-sm">
          {saving ? "Saving…" : format ? "Save format" : "Add format"}
        </button>
        <button type="button" onClick={() => onDone(false)} className="btn-ghost px-4 py-2 text-sm">
          Cancel
        </button>
      </div>
    </form>
  );
}
