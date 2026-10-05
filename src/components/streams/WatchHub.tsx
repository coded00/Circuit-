"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ExternalLink, Tv } from "lucide-react";
import { platformDisplayName } from "@/lib/streams";
import type { WatchChannel, WatchMatch } from "@/lib/watchHub";

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Circuit Watch: a theatre with a channel guide beside it. The video plays on whichever platform hosts it
 * (Twitch, YouTube, Kick, ...); Circuit is the broadcast layer that puts every angle on one screen.
 */
export function WatchHub({
  channels,
  matches,
}: {
  channels: WatchChannel[];
  matches: WatchMatch[];
}) {
  const [activeId, setActiveId] = useState(channels[0]?.id ?? "");
  const [bug, setBug] = useState(true);
  const active = channels.find((c) => c.id === activeId) ?? channels[0];
  const activeMatch = active?.matchId
    ? matches.find((m) => m.id === active.matchId)
    : null;

  // The channel bug shows for a few seconds after tuning in, then gets out of the way of the picture.
  useEffect(() => {
    const t = setTimeout(() => setBug(false), 5000);
    return () => clearTimeout(t);
  }, [activeId]);

  if (!active) return null;
  const where = platformDisplayName(active.platform, active.platformName);
  const tune = (id: string) => {
    setActiveId(id);
    setBug(true);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
      {/* On a phone the column dissolves so the player (and its match line) can stay pinned under the header while the guide scrolls past. */}
      <div className="flex min-w-0 flex-col max-lg:contents">
        <div className="max-lg:sticky max-lg:top-[60px] max-lg:z-20 max-lg:-mx-4 max-lg:bg-background max-lg:px-4 max-lg:pt-1">
          <div className="relative aspect-video w-full cut-lg bg-black [--cut-line:var(--border)]">
            {active.embed ? (
              <iframe
                // A fresh player for each channel, so switching really changes the video.
                key={active.id}
                src={active.embed.src}
                title={active.embed.title}
                allow="autoplay; fullscreen; picture-in-picture"
                referrerPolicy="strict-origin-when-cross-origin"
                sandbox="allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox"
                className="absolute inset-0 h-full w-full border-0"
              />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
                <Tv size={28} className="text-muted" aria-hidden />
                <p className="max-w-xs text-sm text-muted">
                  This channel streams on {where} and can&apos;t play inside
                  Circuit.
                </p>
                <a
                  href={active.url}
                  target="_blank"
                  rel="noopener noreferrer nofollow ugc"
                  className="btn-primary"
                >
                  Open on {where} <ExternalLink size={14} aria-hidden />
                </a>
              </div>
            )}
            <div
              aria-hidden
              className={`pointer-events-none absolute top-0 left-0 flex max-w-[80%] items-stretch transition-opacity duration-500 motion-reduce:transition-none ${bug ? "opacity-100" : "opacity-0"}`}
            >
              <span className="flex items-center bg-accent-volt px-2.5 font-mono text-lg font-bold text-accent-volt-foreground sm:px-3 sm:text-2xl">
                {pad(active.number)}
              </span>
              <span className="flex min-w-0 flex-col justify-center bg-black/75 px-3 py-1.5">
                <span className="truncate font-display text-sm font-bold tracking-tight uppercase sm:text-base">
                  {active.title}
                </span>
                <span className="truncate text-[11px] text-white/60">
                  {active.subtitle ?? where}
                </span>
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 border-b border-border py-3 text-sm">
            {activeMatch ? (
              <div className="flex min-w-0 items-center gap-3">
                <button
                  type="button"
                  disabled={!activeMatch.a.channelId}
                  onClick={() =>
                    activeMatch.a.channelId && tune(activeMatch.a.channelId)
                  }
                  className="truncate font-display text-base font-bold uppercase enabled:hover:text-accent-volt sm:text-lg"
                >
                  {activeMatch.a.name}
                </button>
                <span className="font-mono text-xs text-muted">VS</span>
                <button
                  type="button"
                  disabled={!activeMatch.b.channelId}
                  onClick={() =>
                    activeMatch.b.channelId && tune(activeMatch.b.channelId)
                  }
                  className="truncate font-display text-base font-bold uppercase enabled:hover:text-accent-volt sm:text-lg"
                >
                  {activeMatch.b.name}
                </button>
                <Link
                  href={`/matches/${activeMatch.id}`}
                  className="shrink-0 text-xs text-muted hover:text-foreground"
                >
                  {activeMatch.label}
                </Link>
              </div>
            ) : (
              <span className="truncate text-muted">
                {active.kind === "MAIN"
                  ? "Main broadcast"
                  : `${active.title} on ${where}`}
              </span>
            )}
            <a
              href={active.url}
              target="_blank"
              rel="noopener noreferrer nofollow ugc"
              className="flex shrink-0 items-center gap-1 text-xs text-muted hover:text-foreground"
            >
              {where} <ExternalLink size={12} aria-hidden />
            </a>
          </div>
        </div>

        {matches.length > 0 && (
          <section aria-label="Matches" className="pt-5 max-lg:order-3">
            <h2 className="mb-1 font-display text-sm font-bold tracking-wide uppercase">
              On the bracket
            </h2>
            <ul className="divide-y divide-border">
              {matches.map((m) => (
                <li
                  key={m.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm"
                >
                  <span className="min-w-0 truncate">
                    <span className="font-semibold">{m.a.name}</span>{" "}
                    <span className="text-muted">vs</span>{" "}
                    <span className="font-semibold">{m.b.name}</span>
                    <span className="ml-2 text-xs text-muted">{m.label}</span>
                  </span>
                  <span className="flex gap-3 text-xs">
                    {[m.a, m.b].map(
                      (side) =>
                        side.channelId && (
                          <button
                            key={side.channelId}
                            type="button"
                            onClick={() => tune(side.channelId!)}
                            className="text-accent-volt hover:underline"
                          >
                            Watch {side.name}
                          </button>
                        ),
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <nav aria-label="Channel guide" className="min-w-0 max-lg:order-2">
        <h2 className="mb-1 font-display text-sm font-bold tracking-wide uppercase">
          Channels
        </h2>
        <ul className="divide-y divide-border border-y border-border">
          {channels.map((c) => {
            const on = c.id === active.id;
            return (
              <li key={c.id}>
                <button
                  type="button"
                  aria-current={on ? "true" : undefined}
                  onClick={() => tune(c.id)}
                  className={`relative flex w-full items-center gap-3 py-2.5 pr-2 pl-4 text-left transition-colors motion-reduce:transition-none ${on ? "bg-surface-elevated" : "hover:bg-surface"}`}
                >
                  <span
                    aria-hidden
                    className={`absolute inset-y-0 left-0 w-1 ${on ? "bg-accent-volt" : "bg-transparent"}`}
                  />
                  <span
                    className={`w-8 shrink-0 font-mono text-xl font-bold tabular-nums ${on ? "text-accent-volt" : "text-muted"}`}
                  >
                    {pad(c.number)}
                  </span>
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-sm font-semibold uppercase">
                      {c.title}
                    </span>
                    <span className="truncate text-xs text-muted">
                      {c.subtitle ??
                        (c.kind === "MAIN"
                          ? "Main stage"
                          : platformDisplayName(c.platform, c.platformName))}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
