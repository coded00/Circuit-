"use client";

/**
 * Circuit — small pieces shared by the admin game builder: a JSON fetch
 * wrapper that surfaces the route's own error message, an on/off switch,
 * and up/down reorder buttons.
 */

import { ChevronDown, ChevronUp } from "lucide-react";

export async function catalogRequest(method: "POST" | "PATCH" | "DELETE", url: string, body?: unknown): Promise<string | null> {
  const res = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  }).catch(() => null);
  if (!res) return "Network error — try again.";
  if (res.ok) return null;
  const data = await res.json().catch(() => null);
  return data?.error ?? "Something went wrong.";
}

export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
        checked ? "bg-accent-volt" : "bg-border-strong"
      }`}
    >
      <span
        className={`inline-block h-4 w-4 rounded-full shadow-sm transition-transform ${
          checked ? "translate-x-[18px] bg-accent-volt-foreground" : "translate-x-0.5 bg-surface"
        }`}
      />
    </button>
  );
}

export function ReorderButtons({
  onUp,
  onDown,
  disableUp,
  disableDown,
  label,
}: {
  onUp: () => void;
  onDown: () => void;
  disableUp: boolean;
  disableDown: boolean;
  label: string;
}) {
  const cls =
    "flex h-5 w-6 items-center justify-center rounded text-muted transition hover:bg-surface-elevated hover:text-foreground disabled:opacity-25 disabled:hover:bg-transparent";
  return (
    <span className="flex shrink-0 flex-col">
      <button type="button" onClick={onUp} disabled={disableUp} aria-label={`Move ${label} up`} className={cls}>
        <ChevronUp size={14} />
      </button>
      <button type="button" onClick={onDown} disabled={disableDown} aria-label={`Move ${label} down`} className={cls}>
        <ChevronDown size={14} />
      </button>
    </span>
  );
}

export function StatusBadge({ enabled, labels = ["Active", "Inactive"] }: { enabled: boolean; labels?: [string, string] }) {
  return <span className={`badge ${enabled ? "badge-complete" : "badge-neutral"}`}>{enabled ? labels[0] : labels[1]}</span>;
}
