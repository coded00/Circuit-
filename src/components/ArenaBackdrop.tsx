/**
 * Circuit — a game's art lit like an arena: the artwork, a coloured light
 * taken from that game's tint, a fade into the page, and darkened edges.
 * Put it first inside a `relative isolate` container; it sits behind the
 * content (-z-10) and never takes a click. `ArenaGlow` is the coloured
 * light on its own, for places that already have their own art.
 */

import type { CSSProperties } from "react";
import { GameArtTile } from "@/components/GameArtTile";
import { gameTint } from "@/lib/gameTint";

/** A game-coloured light across whatever it sits over. Position and fade it with `className`. */
export function ArenaGlow({ game, className = "" }: { game: string; className?: string }) {
  return <div aria-hidden className={`arena-glow absolute inset-0 ${className}`} style={{ "--glow": gameTint(game) } as CSSProperties} />;
}

const FADE = {
  /** Into the page below the art. */
  down: "bg-gradient-to-b from-background/10 via-background/60 to-background",
  /** From the page on the left, so text there stays readable over the art. */
  right: "bg-gradient-to-r from-background via-background/90 to-background/30",
} as const;

export function ArenaBackdrop({ game, art = 0.5, fade = "down" }: { game: string; /** How strongly the artwork shows, 0 to 1. */ art?: number; fade?: keyof typeof FADE }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0" style={{ opacity: art }}>
        <GameArtTile game={game} fill hideLabel imgWidth={1400} className="scale-110" />
      </div>
      <ArenaGlow game={game} />
      <div className={`absolute inset-0 ${FADE[fade]}`} />
      <div className="arena-vignette absolute inset-0" />
    </div>
  );
}
