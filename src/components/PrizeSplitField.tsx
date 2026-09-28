"use client";

/**
 * Circuit — choosing how a tournament's cash prize is shared: presets or
 * a custom percentage per place, with the naira amount each place gets.
 * The server re-validates with parsePrizeSplit (src/lib/prizes.ts).
 */

import { useState } from "react";
import { effectiveSplit, parsePrizeSplit, placeLabel, plannedShares, PRIZE_PRESETS } from "@/lib/prizes";

function naira(kobo: number) {
  return `₦${(kobo / 100).toLocaleString("en-NG", { maximumFractionDigits: 2 })}`;
}

export function PrizeSplitField({
  value,
  onChange,
  maxPlaces,
  prizeAmount,
  locked = false,
  knockout = false,
  onValidityChange,
}: {
  /** [] = winner takes all. */
  value: number[];
  onChange: (next: number[]) => void;
  maxPlaces: number;
  /** Kobo, for the preview; 0/null hides the field's amounts. */
  prizeAmount: number | null;
  locked?: boolean;
  knockout?: boolean;
  /** Called with true while the custom split can't be saved — wire into submit-disabled. */
  onValidityChange?: (blocked: boolean) => void;
}) {
  const current = effectiveSplit(value);
  const preset = PRIZE_PRESETS.find((p) => p.split.join() === current.join());
  const [custom, setCustom] = useState(!preset);
  const [text, setText] = useState(current.join(", "));
  const parsed = custom ? parsePrizeSplit(text, maxPlaces) : null;

  return (
    <fieldset disabled={locked} className="flex flex-col gap-2">
      <legend className="field-label mb-1.5">Prize split</legend>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Prize split">
        {PRIZE_PRESETS.map((p) => {
          const tooMany = p.split.length > maxPlaces;
          const on = !custom && preset?.id === p.id;
          return (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={tooMany}
              title={tooMany ? `This tournament can pay at most ${maxPlaces} places` : undefined}
              onClick={() => {
                setCustom(false);
                onValidityChange?.(false);
                setText(p.split.join(", "));
                onChange(p.split.length === 1 ? [] : p.split);
              }}
              className={`min-h-9 rounded-[10px] border px-3 py-1.5 text-sm transition ${
                tooMany
                  ? "cursor-not-allowed border-dashed border-border text-muted-strong"
                  : on
                    ? "border-foreground bg-foreground font-semibold text-background"
                    : "border-border bg-surface hover:border-border-hover"
              }`}
            >
              {p.label}
            </button>
          );
        })}
        <button
          type="button"
          role="radio"
          aria-checked={custom}
          onClick={() => setCustom(true)}
          className={`min-h-9 rounded-[10px] border px-3 py-1.5 text-sm transition ${custom ? "border-foreground bg-foreground font-semibold text-background" : "border-border bg-surface hover:border-border-hover"}`}
        >
          Custom
        </button>
      </div>
      {custom && (
        <input
          aria-label="Custom prize split"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            const next = parsePrizeSplit(e.target.value, maxPlaces);
            onValidityChange?.(!next.ok);
            if (next.ok) onChange(next.value);
          }}
          placeholder="e.g. 50, 25, 15, 10"
          className="field-input font-mono text-sm"
        />
      )}
      {parsed && !parsed.ok ? (
        <span className="field-hint text-danger">{parsed.error}</span>
      ) : current.length > maxPlaces ? (
        <span className="field-hint text-danger">
          This tournament can pay at most {maxPlaces} places — pick a shorter split.
        </span>
      ) : (
        <span className="field-hint">
          {prizeAmount
            ? plannedShares(prizeAmount, value)
                .map((s) => `${placeLabel(s.place)} ${naira(s.amount)} (${s.percent}%)`)
                .join(" · ")
            : "Percent of the prize per finishing place."}
          {knockout && current.length === 3 ? " — the two semi-final losers share 3rd." : ""}
          {locked ? " Locked — players have already registered." : " Each place claims its own share. Ties split the places they cover."}
        </span>
      )}
    </fieldset>
  );
}
