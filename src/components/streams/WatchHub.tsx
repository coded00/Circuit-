"use client";

import { useState } from "react";
import Link from "next/link";
import { ExternalLink, Tv } from "lucide-react";
import { platformDisplayName } from "@/lib/streams";
import type { WatchChannel, WatchMatch } from "@/lib/watchHub";

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Circuit Watch: one player, and a row of channels to switch between without leaving the page. Each channel is a
 * stream hosted somewhere else (Twitch, YouTube, Kick, ...); Circuit is the layer that brings them together.
 */
export function WatchHub({ channels, matches }: { channels: WatchChannel[]; matches: WatchMatch[] }) {
  const [activeId, setActiveId] = useState(channels[0]?.id ?? "");
  const active = channels.find((c) => c.id === activeId) ?? channels[0];
  const activeMatch = active?.matchId ? matches.find((m) => m.id === active.matchId) : null;
  if (!active) return null;

  const where = platformDisplayName(active.platform, active.platformName);

  return (
    <div className="flex flex-col gap-4">
      <div className="cut-lg overflow-hidden border border-border bg-black [--cut-line:var(--border)]">
        <div className="relative aspect-video w-full">
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
              <Tv size={32} className="text-muted" aria-hidden />
              <p className="text-sm text-muted">This channel streams on {where} and can&apos;t play inside Circuit.</p>
              <a href={active.url} target="_blank" rel="noopener noreferrer nofollow ugc" className="btn-primary">
                Open on {where} <ExternalLink size={14} aria-hidden />
              </a>
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-surface px-4 py-3">
          <div className="flex min-w-0 flex-col">
            <span className="text-eyebrow text-muted">
              CH {pad(active.number)} · {active.kind === "MAIN" ? "Main stage" : "Player"}
            </span>
            <span className="truncate font-display text-lg font-bold tracking-tight uppercase">{active.title}</span>
            {active.subtitle && <span className="truncate text-xs text-muted">{active.subtitle}</span>}
          </div>
          <a href={active.url} target="_blank" rel="noopener noreferrer nofollow ugc" className="btn-secondary text-xs">
            Open on {where} <ExternalLink size={12} aria-hidden />
          </a>
        </div>
      </div>

      <section aria-label="Switch view" className="flex flex-col gap-2">
        <h2 className="text-eyebrow text-muted">Switch view</h2>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
          {channels.map((c) => (
            <button
              key={c.id}
              type="button"
              aria-pressed={c.id === active.id}
              onClick={() => setActiveId(c.id)}
              className={`cut-sm flex min-w-[8.5rem] shrink-0 flex-col items-start gap-0.5 border px-3 py-2 text-left transition-colors [--cut-line:var(--border)] ${
                c.id === active.id ? "border-accent-volt bg-surface-elevated" : "border-border bg-surface hover:border-border-hover"
              }`}
            >
              <span className="font-mono text-[11px] text-muted">CH {pad(c.number)}</span>
              <span className="max-w-[10rem] truncate text-sm font-semibold uppercase">{c.title}</span>
              <span className="max-w-[10rem] truncate text-[11px] text-muted">{c.subtitle ?? platformDisplayName(c.platform, c.platformName)}</span>
            </button>
          ))}
        </div>
      </section>

      {activeMatch && (
        <section aria-label="Match info" className="cut-lg flex flex-col gap-2 border border-border bg-surface p-4 [--cut-line:var(--border)]">
          <h2 className="text-eyebrow text-muted">Match info</h2>
          <div className="flex items-center justify-center gap-4 py-1 text-center">
            <span className="min-w-0 flex-1 truncate font-display text-xl font-bold uppercase">{activeMatch.a.name}</span>
            <span className="text-eyebrow text-muted">vs</span>
            <span className="min-w-0 flex-1 truncate font-display text-xl font-bold uppercase">{activeMatch.b.name}</span>
          </div>
          <div className="flex items-center justify-between text-xs text-muted">
            <span>{activeMatch.label}</span>
            <Link href={`/matches/${activeMatch.id}`} className="text-accent-blue hover:underline">
              Match page →
            </Link>
          </div>
        </section>
      )}

      {matches.length > 0 && (
        <section aria-label="Matches" className="flex flex-col gap-2">
          <h2 className="text-eyebrow text-muted">Matches</h2>
          <ul className="flex flex-col gap-2">
            {matches.map((m) => (
              <li key={m.id} className="cut-sm flex flex-wrap items-center justify-between gap-2 border border-border bg-surface px-3 py-2 text-sm [--cut-line:var(--border)]">
                <span className="flex min-w-0 flex-col">
                  <span className="truncate font-semibold">
                    {m.a.name} <span className="text-muted">vs</span> {m.b.name}
                  </span>
                  <span className="text-xs text-muted">{m.label}</span>
                </span>
                <span className="flex flex-wrap gap-1.5">
                  {[m.a, m.b].map(
                    (side) =>
                      side.channelId && (
                        <button key={side.channelId} type="button" onClick={() => setActiveId(side.channelId!)} className="btn-secondary text-xs">
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
  );
}
