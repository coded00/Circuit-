"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { OptionCard } from "@/components/OptionCard";

function nairaToKobo(value: string): number {
  const naira = Number(value || 0);
  return Math.round(naira * 100);
}

type Friend = { handle: string; displayName: string };

export default function BattleForm({
  games,
  friends,
}: {
  games: { id: string; name: string }[];
  friends: Friend[];
}) {
  const router = useRouter();
  const [game, setGame] = useState(games[0]?.name ?? "");
  const [format, setFormat] = useState<"SINGLE" | "BEST_OF_3">("SINGLE");
  const [staked, setStaked] = useState(false);
  const [stakeNaira, setStakeNaira] = useState("");
  const [visibility, setVisibility] = useState<"OPEN" | "TARGETED" | "FRIENDS">("OPEN");
  const [targetHandle, setTargetHandle] = useState("");
  const [streamUrl, setStreamUrl] = useState("");
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
        streamUrl: streamUrl || null,
        stakeAmount: staked ? nairaToKobo(stakeNaira) : 0,
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
    <form onSubmit={handleSubmit} className="card flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="game" className="field-label">
          Game
        </label>
        <select id="game" required value={game} onChange={(e) => setGame(e.target.value)} className="field-input">
          {games.length === 0 && <option value="">No games available — ask an admin to add one</option>}
          {games.map((g) => (
            <option key={g.id} value={g.name}>
              {g.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="field-label">Format</span>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <OptionCard
            selected={format === "SINGLE"}
            onSelect={() => setFormat("SINGLE")}
            title="Single match"
            description="One game decides it"
          />
          <OptionCard
            selected={format === "BEST_OF_3"}
            onSelect={() => setFormat("BEST_OF_3")}
            title="Best of 3"
            description="First to 2 wins"
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="field-label">Stake</span>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <OptionCard selected={!staked} onSelect={() => setStaked(false)} title="Free" description="No entry fee" />
          <OptionCard
            selected={staked}
            onSelect={() => setStaked(true)}
            title="Staked"
            description="Winner takes the pot"
          />
        </div>
        {staked && (
          <div className="mt-1 flex flex-col gap-1.5">
            <label htmlFor="stakeNaira" className="field-label">
              Stake per player (₦)
            </label>
            <input
              id="stakeNaira"
              type="number"
              min={1}
              step="0.01"
              required
              value={stakeNaira}
              onChange={(e) => setStakeNaira(e.target.value)}
              className="field-input"
            />
            <span className="field-hint">
              Locked from your wallet now. Your opponent matches it to accept — the winner takes both.
            </span>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="field-label">Who can accept</span>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <OptionCard
            selected={visibility === "OPEN"}
            onSelect={() => setVisibility("OPEN")}
            title="Anyone"
            description="Posted to the open board"
          />
          <OptionCard
            selected={visibility === "FRIENDS"}
            onSelect={() => setVisibility("FRIENDS")}
            title="My friends"
            description="Only your friend list sees it"
          />
          <OptionCard
            selected={visibility === "TARGETED"}
            onSelect={() => setVisibility("TARGETED")}
            title="A specific player"
            description="They're notified directly"
          />
        </div>
      </div>

      {visibility === "TARGETED" && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="targetHandle" className="field-label">
            Their handle
          </label>
          {friends.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {friends.map((f) => (
                <button
                  key={f.handle}
                  type="button"
                  onClick={() => setTargetHandle(f.handle)}
                  className={`badge ${targetHandle === f.handle ? "badge-brand" : "badge-neutral"}`}
                >
                  @{f.handle}
                </button>
              ))}
            </div>
          )}
          <input
            id="targetHandle"
            required
            placeholder="e.g. player_kb6rfwj1"
            value={targetHandle}
            onChange={(e) => setTargetHandle(e.target.value)}
            className="field-input"
          />
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="streamUrl" className="field-label">
          Stream link (optional)
        </label>
        <input
          id="streamUrl"
          type="url"
          placeholder="https://twitch.tv/yourchannel"
          value={streamUrl}
          onChange={(e) => setStreamUrl(e.target.value)}
          className="field-input"
        />
      </div>

      {error && <p className="field-error">{error}</p>}

      <button type="submit" disabled={submitting} className="btn-primary">
        {submitting ? "Opening…" : "Open Challenge"}
      </button>
    </form>
  );
}
