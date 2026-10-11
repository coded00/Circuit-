"use client";

import { PLATFORM_LABEL, PLATFORM_PLACEHOLDER, SELECTABLE_PLATFORMS, STREAM_MODES, type SelectablePlatform } from "@/lib/streams";
import type { StreamMode } from "@prisma/client";

export type StreamValue = { platform: SelectablePlatform; platformName: string; url: string };
export const EMPTY_STREAM: StreamValue = { platform: "TWITCH", platformName: "", url: "" };

/** The platform and channel address of one stream. Used for the tournament's own stream and for a player's. */
export function StreamFields({ idPrefix, value, onChange, urlLabel = "Channel URL", hint }: { idPrefix: string; value: StreamValue; onChange: (next: StreamValue) => void; urlLabel?: string; hint?: string }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${idPrefix}-platform`} className="field-label">
          Platform
        </label>
        <select id={`${idPrefix}-platform`} value={value.platform} onChange={(e) => onChange({ ...value, platform: e.target.value as SelectablePlatform })} className="field-select">
          {SELECTABLE_PLATFORMS.map((p) => (
            <option key={p} value={p}>
              {PLATFORM_LABEL[p]}
            </option>
          ))}
        </select>
      </div>
      {value.platform === "OTHER" && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${idPrefix}-platform-name`} className="field-label">
            Streaming platform
          </label>
          <input id={`${idPrefix}-platform-name`} value={value.platformName} maxLength={30} placeholder="The name of your streaming platform" onChange={(e) => onChange({ ...value, platformName: e.target.value })} className="field-input" />
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${idPrefix}-url`} className="field-label">
          {urlLabel}
        </label>
        <input id={`${idPrefix}-url`} type="url" inputMode="url" placeholder={PLATFORM_PLACEHOLDER[value.platform]} value={value.url} maxLength={300} onChange={(e) => onChange({ ...value, url: e.target.value })} className="field-input" />
        {hint && <span className="field-hint">{hint}</span>}
      </div>
    </div>
  );
}

/** How the tournament is broadcast: the four modes, as a list of choices with a sentence each. */
export function StreamModePicker({ idPrefix, value, onChange }: { idPrefix: string; value: StreamMode; onChange: (next: StreamMode) => void }) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="field-label">How will you stream this tournament?</legend>
      {STREAM_MODES.map((m) => (
        <label key={m.value} htmlFor={`${idPrefix}-${m.value}`} className={`flex cursor-pointer items-start gap-3 border p-3 text-sm ${value === m.value ? "border-accent-volt bg-surface-elevated" : "border-border"}`}>
          <input id={`${idPrefix}-${m.value}`} type="radio" name={`${idPrefix}-mode`} checked={value === m.value} onChange={() => onChange(m.value)} className="mt-0.5 h-4 w-4 shrink-0 accent-accent-volt" />
          <span className="flex flex-col gap-0.5">
            <span className="font-semibold">
              {m.label}
              {m.recommended && <span className="ml-2 text-xs font-normal text-accent-volt">Recommended</span>}
            </span>
            <span className="text-muted">{m.description}</span>
          </span>
        </label>
      ))}
    </fieldset>
  );
}
