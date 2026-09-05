"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const inputClass =
  "rounded border border-black/15 px-3 py-2 dark:border-white/20 dark:bg-black";
const labelClass = "text-sm font-medium";
const fieldClass = "flex flex-col gap-1";

export default function BattleForm() {
  const router = useRouter();
  const [game, setGame] = useState("");
  const [format, setFormat] = useState<"SINGLE" | "BEST_OF_3">("SINGLE");
  const [visibility, setVisibility] = useState<"OPEN" | "TARGETED">("OPEN");
  const [targetHandle, setTargetHandle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    const res = await fetch("/api/battles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        game,
        format,
        visibility,
        targetHandle: visibility === "TARGETED" ? targetHandle : undefined,
      }),
    });
    const data = await res.json().catch(() => null);

    if (!res.ok) {
      setError(data?.error ?? "Something went wrong. Please try again.");
      setSubmitting(false);
      return;
    }

    router.push(`/battles/${data.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <div className={fieldClass}>
        <label htmlFor="game" className={labelClass}>
          Game
        </label>
        <input
          id="game"
          required
          placeholder="e.g. EA FC 26"
          value={game}
          onChange={(e) => setGame(e.target.value)}
          className={inputClass}
        />
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className={labelClass}>Format</legend>
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" checked={format === "SINGLE"} onChange={() => setFormat("SINGLE")} />
          Single match
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" checked={format === "BEST_OF_3"} onChange={() => setFormat("BEST_OF_3")} />
          Best of 3
        </label>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className={labelClass}>Who can accept</legend>
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" checked={visibility === "OPEN"} onChange={() => setVisibility("OPEN")} />
          Anyone — post to the open board
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            checked={visibility === "TARGETED"}
            onChange={() => setVisibility("TARGETED")}
          />
          A specific player
        </label>
      </fieldset>

      {visibility === "TARGETED" && (
        <div className={fieldClass}>
          <label htmlFor="targetHandle" className={labelClass}>
            Their handle
          </label>
          <input
            id="targetHandle"
            required
            placeholder="e.g. player_kb6rfwj1"
            value={targetHandle}
            onChange={(e) => setTargetHandle(e.target.value)}
            className={inputClass}
          />
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={submitting}
        className="rounded bg-foreground px-4 py-2 font-medium text-background disabled:opacity-50"
      >
        {submitting ? "Opening…" : "Open Battle"}
      </button>
    </form>
  );
}
