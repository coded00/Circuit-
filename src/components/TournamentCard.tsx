/**
 * Circuit — the one tournament card (homepage Featured/Upcoming rows,
 * calendar, game pages). Cinematic: the game's art runs edge to edge, lit
 * with that game's colour, and the title, status and the three facts people
 * choose a tournament by (prize/entry, start, slots) sit over it on a dark
 * fade. A LIVE tournament glows; a finished or cancelled one dims so open
 * and live ones stand out. The whole card is the link.
 */

import { compactNaira } from "@/lib/money";
import Link from "next/link";
import { ViewTransition } from "react";
import { ArrowRight } from "lucide-react";
import { GameArtTile } from "@/components/GameArtTile";
import { tournamentArtName } from "@/lib/viewTransitions";
import { StatusPill } from "@/components/StatusPill";
import { tournamentPath } from "@/lib/seo";
import { ArenaGlow } from "@/components/ArenaBackdrop";
import { tournamentCtaLabel, tournamentDisplayStatus } from "@/lib/tournamentCta";

export type TournamentCardData = {
  id: string;
  name: string;
  game: string;
  status: string;
  teamSize: string;
  entryFee: number;
  participantCap: number;
  startAt: Date;
  registrationOpenAt?: Date;
  prizeAmount: number | null;
  posterUrl: string | null;
  _count: { registrations: number };
};

const formatNaira = compactNaira;

function formatShortDate(date: Date): string {
  return date.toLocaleDateString("en-NG", { month: "short", day: "numeric" });
}

export function TournamentCard({
  tournament: t,
  featured = false,
  morph = false,
}: {
  tournament: TournamentCardData;
  featured?: boolean;
  /** Claim this tournament's view-transition name, so the art morphs into
   *  the tournament page hero. Only one card per tournament on a page may
   *  set it (duplicate names cancel the transition). */
  morph?: boolean;
}) {
  const registered = t._count.registrations;
  // "Draft" is organizer language, so an announced-but-not-yet-open
  // tournament reads "Announced"; an open one with no slots reads "Full".
  const counts = {
    status: t.status,
    participantCap: t.participantCap,
    registered,
  };
  const status = tournamentDisplayStatus(counts);
  const cta = tournamentCtaLabel(counts);
  const fill = t.participantCap > 0 ? Math.min(100, (registered / t.participantCap) * 100) : 0;
  const spotsLeft = t.participantCap - registered;
  const nearlyFull = spotsLeft > 0 && t.participantCap > 0 && spotsLeft / t.participantCap <= 0.2;
  const live = t.status === "LIVE";
  const ended = t.status === "COMPLETE" || t.status === "CANCELLED";

  const art = <GameArtTile game={t.game} posterUrl={t.posterUrl} className={`h-full w-full ${ended ? "ended-art" : ""}`} hideLabel imgWidth={640} fill />;

  return (
    <Link
      href={tournamentPath(t)}
      className={`group relative isolate flex h-full w-full flex-col overflow-hidden cut-lg border bg-black text-white transition duration-[var(--duration-base)] ease-[var(--ease-standard)] hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.99] active:duration-[var(--duration-instant)] ${
        live ? "live-glow border-live/60 [--cut-line:color-mix(in_srgb,var(--live)_60%,transparent)]" : "border-border [--cut-line:var(--border)] hover:border-border-hover"
      } ${ended ? "opacity-90" : ""}`}
    >
      {/* Same shape on every card: a banner-shaped art area (the organizer's
          banner, or the game's art), then the details. */}
      <div className="relative aspect-[3/1] w-full shrink-0 overflow-hidden bg-black">
        <div
          aria-hidden
          className="absolute inset-0 transition-transform duration-[var(--duration-reveal)] ease-[var(--ease-standard)] group-hover:scale-[1.04]"
        >
          {morph ? (
            <ViewTransition name={tournamentArtName(t.id)} share="tournament-morph" default="none">
              {art}
            </ViewTransition>
          ) : (
            art
          )}
        </div>
        <ArenaGlow game={t.game} className="opacity-40" />
      </div>

      <div className={`flex flex-1 flex-col justify-center gap-3 p-4`}>
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex items-center justify-between gap-2">
            <span className="min-w-0 truncate font-mono text-[11px] tracking-wide text-white/70 uppercase">
              {t.game} · {t.teamSize}
            </span>
            <span className="flex shrink-0 items-center gap-1 [&_.badge]:px-2 [&_.badge]:py-0.5 [&_.badge]:text-[11px] [&_.badge-open]:bg-success-strong!">
              <StatusPill tone={status.tone} pulse={status.pulse} solid>
                {status.label === "Registration open" ? "Open" : status.label}
              </StatusPill>
              {featured && <span className="badge bg-accent-volt text-accent-volt-foreground">Featured</span>}
            </span>
          </div>
          <span className="line-clamp-2 font-display text-lg leading-[1.05] font-bold tracking-tight uppercase sm:text-xl">{t.name}</span>
        </div>

        <dl className="grid grid-cols-[1fr_1fr_0.8fr] gap-2 cut-sm [--cut-line:rgb(255_255_255/0.1)] border border-white/10 bg-black/60 p-2.5">
          <div className="flex min-w-0 flex-col gap-0.5">
            <dt className="text-[11px] font-medium tracking-wide text-white/60 uppercase">{t.prizeAmount ? "Prize" : "Entry"}</dt>
            <dd className={`text-stat truncate text-sm ${t.prizeAmount ? "text-gold" : t.entryFee === 0 ? "text-success" : ""}`}>
              {t.prizeAmount ? formatNaira(t.prizeAmount) : t.entryFee === 0 ? "Free" : formatNaira(t.entryFee)}
            </dd>
          </div>
          <div className="flex min-w-0 flex-col gap-0.5">
            <dt className="text-[11px] font-medium tracking-wide text-white/60 uppercase">
              {t.status === "DRAFT" && t.registrationOpenAt ? "Opens" : "Starts"}
            </dt>
            <dd className="text-stat truncate text-sm">{formatShortDate(t.status === "DRAFT" && t.registrationOpenAt ? t.registrationOpenAt : t.startAt)}</dd>
          </div>
          <div className="flex min-w-0 flex-col gap-0.5">
            <dt className="text-[11px] font-medium tracking-wide text-white/60 uppercase">Slots</dt>
            <dd className={`text-stat truncate text-sm ${nearlyFull || spotsLeft <= 0 ? "text-accent-orange" : ""}`}>
              {registered}/{t.participantCap}
            </dd>
          </div>
        </dl>

        <div className="h-1 w-full overflow-hidden rounded-none bg-white/15" aria-hidden>
          <div
            className={`h-full rounded-full transition-[width] duration-[var(--duration-reveal)] ${spotsLeft <= 0 || nearlyFull ? "bg-accent-orange" : "bg-accent-volt"}`}
            style={{ width: `${fill}%` }}
          />
        </div>

        <span className="flex items-center justify-between text-[13px] font-semibold transition-colors group-hover:text-accent-volt">
          {cta}
          <ArrowRight size={15} className="transition-transform duration-[var(--duration-base)] group-hover:translate-x-0.5" aria-hidden />
        </span>
      </div>
    </Link>
  );
}
