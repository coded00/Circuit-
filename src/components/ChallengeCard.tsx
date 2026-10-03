/**
 * Circuit — one open Challenge as a duel poster. Shared by the /battles board
 * and the homepage's Open challenges.
 *
 * It is a scene, not a listing: the game's art fills the card and is lit in
 * that game's colour, the challenger stands on one side in warm light, and the
 * other side is an empty slot in cool light with a ring that keeps asking
 * "you?". The stake reads like the prize on a fight bill. Every listed
 * challenge is open, so there is no status badge. The whole card is the link.
 */

import Link from "next/link";
import { ArrowRight, Users } from "lucide-react";
import { GameArtTile } from "@/components/GameArtTile";
import { ArenaGlow } from "@/components/ArenaBackdrop";
import { avatarHue, challengerTier, isFresh, potOf, timeAgo, winRate } from "@/lib/challengeView";

export type ChallengeCardData = {
  id: string;
  game: string;
  format: string;
  visibility: string;
  stakeAmount: number;
  createdAt: Date;
  creator: { displayName: string; handle: string; avatarUrl: string | null };
};

function formatNaira(kobo: number): string {
  return `₦${(kobo / 100).toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;
}

/** Their own picture if they have one; otherwise a disc in a colour that is theirs alone. */
function Fighter({ person }: { person: ChallengeCardData["creator"] }) {
  const size = "h-14 w-14 @min-[420px]:h-[72px] @min-[420px]:w-[72px]";
  // A lime frame around the sliced portrait: the outer shape is the frame, the inner one the picture.
  const frame = `${size} cut-avatar shrink-0 bg-accent-volt/80 p-[2px]`;
  if (person.avatarUrl) {
    return (
      <span className={frame}>
        {/* eslint-disable-next-line @next/next/no-img-element -- uploaded or external avatar URL */}
        <img src={person.avatarUrl} alt="" className="h-full w-full cut-avatar object-cover" />
      </span>
    );
  }
  const hue = avatarHue(person.handle);
  return (
    <span className={frame}>
      <span
        aria-hidden
        className="flex h-full w-full items-center justify-center cut-avatar font-display text-2xl font-bold text-white @min-[420px]:text-3xl"
        style={{ backgroundImage: `linear-gradient(145deg, hsl(${hue} 62% 46%), hsl(${(hue + 28) % 360} 66% 28%))` }}
      >
        {person.displayName.slice(0, 1).toUpperCase()}
      </span>
    </span>
  );
}

/** The empty place across from the challenger: a dashed ring that pings, waiting for someone to step in. */
function EmptySlot({ mine }: { mine: boolean }) {
  return (
    <div className="flex min-w-0 flex-col items-center gap-2 text-center">
      <span className="relative flex h-14 w-14 items-center justify-center @min-[420px]:h-[72px] @min-[420px]:w-[72px]">
        <span aria-hidden className="absolute inset-0 animate-ping cut-avatar border border-indigo-300/50 motion-reduce:animate-none" />
        <span
          aria-hidden
          className="absolute inset-0 cut-avatar border-2 border-dashed border-white/45 bg-white/5 transition-colors duration-[var(--duration-base)] group-hover:border-accent-volt"
        />
        <span aria-hidden className="font-display text-3xl font-bold text-white/80 @min-[420px]:text-4xl">
          {mine ? "…" : "?"}
        </span>
      </span>
      <span className="font-display text-sm leading-none font-bold tracking-wide text-white/90 uppercase">{mine ? "Waiting" : "You?"}</span>
    </div>
  );
}

export function ChallengeCard({ battle: b, record, mine = false }: { battle: ChallengeCardData; record: { wins: number; losses: number } | null; mine?: boolean }) {
  const rate = record ? winRate(record.wins, record.losses) : null;
  const tier = challengerTier(record?.wins ?? 0, record?.losses ?? 0);
  const staked = b.stakeAmount > 0;
  const fresh = isFresh(b.createdAt);

  return (
    <div className="@container h-full">
      <Link
        href={`/battles/${b.id}`}
        className="group relative isolate flex h-full min-h-[18.5rem] flex-col justify-between gap-5 overflow-hidden cut-lg [--cut-line:var(--border)] border border-border bg-black p-4 text-white transition duration-[var(--duration-base)] ease-[var(--ease-standard)] hover:-translate-y-0.5 hover:border-accent-volt/60 hover:shadow-[0_0_44px_-14px_var(--accent-volt)] focus-visible:ring-2 focus-visible:ring-accent-volt focus-visible:outline-none active:translate-y-0 active:scale-[0.99] @min-[420px]:p-5"
      >
        {/* The scene: the game's art, its colour as light, a warm and a cool spot, and a dark fade for the text. */}
        <div aria-hidden className="absolute inset-0 -z-10 transition-transform duration-[var(--duration-reveal)] ease-[var(--ease-standard)] group-hover:scale-[1.07]">
          <GameArtTile game={b.game} fill hideLabel imgWidth={900} className="h-full w-full opacity-40" />
        </div>
        <ArenaGlow game={b.game} className="-z-10 opacity-40" />
        <div aria-hidden className="duel-lights absolute inset-0 -z-10" />
        <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-t from-black/95 via-black/70 to-black/50" />
        {/* A scrim for the labels along the top, and a soft dark pool behind the duel so art never fights the VS. */}
        <div aria-hidden className="absolute inset-x-0 top-0 -z-10 h-1/3 bg-gradient-to-b from-black/70 to-transparent" />
        <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(38%_42%_at_50%_52%,rgba(0,0,0,0.55),transparent)]" />
        <div aria-hidden className="arena-vignette absolute inset-0 -z-10" />

        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1.5">
            <span className="flex items-center gap-2 font-mono text-[11px] font-semibold tracking-[0.14em] uppercase">
              {fresh ? (
                <span className="relative flex h-2 w-2 shrink-0" aria-hidden>
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-70 motion-reduce:animate-none" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
                </span>
              ) : (
                <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-accent-volt" />
              )}
              <span className="text-white/90">
                {fresh ? "Just posted" : (<><span className="@min-[420px]:hidden">Open</span><span className="hidden @min-[420px]:inline">Open challenge</span></>)}
              </span>
              {mine && <span className="rounded bg-accent-volt px-1.5 py-px text-[10px] font-bold text-accent-volt-foreground">YOURS</span>}
            </span>
            <span className="truncate font-display text-lg leading-none font-bold tracking-tight uppercase">{b.game}</span>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1.5 font-mono text-[11px] font-semibold tracking-[0.12em] uppercase">
            <span className="cut-xs border border-white/25 bg-black/40 px-2.5 py-1 whitespace-nowrap">
              <span className="@min-[420px]:hidden">{b.format === "BEST_OF_3" ? "Bo3" : "Bo1"}</span>
              <span className="hidden @min-[420px]:inline">{b.format === "BEST_OF_3" ? "Best of 3" : "Single match"}</span>
            </span>
            {b.visibility === "FRIENDS" && (
              <span className="flex items-center gap-1 text-white/80">
                <Users size={11} aria-hidden /> Friends only
              </span>
            )}
          </div>
        </div>

        {/* The duel. */}
        <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-2">
          <div className="flex min-w-0 flex-col items-center gap-2 text-center">
            <Fighter person={b.creator} />
            <div className="flex min-w-0 max-w-full flex-col gap-0.5">
              <span className="line-clamp-2 font-display text-lg leading-[1.05] font-bold tracking-tight break-words uppercase @min-[420px]:text-xl" title={`${b.creator.displayName} (@${b.creator.handle})`}>
                {b.creator.displayName}
              </span>
              <span
                className={`font-mono text-[10px] leading-tight font-semibold tracking-[0.1em] uppercase ${tier.tone === "strong" ? "text-accent-volt" : "text-white/70"}`}
                title={record ? `${record.wins} wins and ${record.losses} losses in ${b.game} challenges` : `No finished ${b.game} challenges yet`}
              >
                {record && rate !== null ? `${record.wins}W ${record.losses}L · ${rate}%` : "New challenger"}
              </span>
            </div>
          </div>

          <span
            aria-hidden
            className="flex h-14 items-center font-display text-3xl leading-none font-extrabold text-white @min-[420px]:h-[72px] [text-shadow:0_0_26px_rgba(193,244,0,0.65)] @min-[420px]:text-4xl"
          >
            VS
          </span>

          <EmptySlot mine={mine} />
        </div>

        {/* The bill: what's on the line, and how to take it. */}
        <div className="flex items-center justify-between gap-3 rounded-[12px] border border-white/10 bg-black/60 px-3.5 py-2.5">
          <div className="flex min-w-0 flex-col gap-0.5" title={staked ? "Both players put in the same stake. The winner takes the whole pot." : undefined}>
            {staked ? (
              <>
                <span className="font-display text-2xl leading-none font-bold tracking-tight text-gold tabular-nums">{formatNaira(b.stakeAmount)}</span>
                <span className="truncate text-[11px] text-white/70">winner takes {formatNaira(potOf(b.stakeAmount))}</span>
              </>
            ) : (
              <>
                <span className="font-display text-2xl leading-none font-bold tracking-tight text-success">FREE</span>
                <span className="truncate text-[11px] text-white/70">nothing at stake · {timeAgo(b.createdAt)}</span>
              </>
            )}
          </div>
          <span className="flex shrink-0 items-center gap-1.5 text-sm font-semibold transition-colors group-hover:text-accent-volt">
            {mine ? "View" : "Take it on"}
            <ArrowRight size={15} aria-hidden className="transition-transform duration-[var(--duration-base)] group-hover:translate-x-1" />
          </span>
        </div>
      </Link>
    </div>
  );
}
