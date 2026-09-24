/**
 * Circuit — the one tournament card (homepage Featured/Upcoming rows,
 * calendar, game pages). Poster on top with only the status on it; below,
 * game + name, then the three facts people choose a tournament by —
 * prize/entry, start date, slots — with a slim fill bar. The whole card is
 * the link; no per-card button, no gradient scrim over the art.
 */

import Link from "next/link";
import { GameArtTile } from "@/components/GameArtTile";
import { StatusPill, tournamentStatusInfo } from "@/components/StatusPill";
import { tournamentPath } from "@/lib/seo";

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

function formatNaira(kobo: number): string {
  return `₦${(kobo / 100).toLocaleString("en-NG")}`;
}

function formatShortDate(date: Date): string {
  return date.toLocaleDateString("en-NG", { month: "short", day: "numeric" });
}

export function TournamentCard({ tournament: t, featured = false }: { tournament: TournamentCardData; featured?: boolean }) {
  // "Draft" is organizer language; on a public card an announced-but-not-
  // yet-open tournament reads as "Announced".
  const status = t.status === "DRAFT" ? { tone: "neutral" as const, label: "Announced" } : tournamentStatusInfo(t.status);
  const registered = t._count.registrations;
  const fill = t.participantCap > 0 ? Math.min(100, (registered / t.participantCap) * 100) : 0;
  const spotsLeft = t.participantCap - registered;
  const nearlyFull = spotsLeft > 0 && t.participantCap > 0 && spotsLeft / t.participantCap <= 0.2;

  return (
    <Link
      href={tournamentPath(t)}
      className="group flex h-full w-full flex-col overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface transition duration-[var(--duration-base)] ease-[var(--ease-standard)] hover:-translate-y-0.5 hover:border-border-hover active:translate-y-0 active:scale-[0.99] active:duration-[var(--duration-instant)]"
    >
      <div className="relative aspect-[16/10] w-full shrink-0 overflow-hidden bg-surface-elevated">
        <div className="h-full w-full transition-transform duration-[var(--duration-moderate)] ease-[var(--ease-standard)] group-hover:scale-[1.03]">
          <GameArtTile game={t.game} posterUrl={t.posterUrl} className="h-full w-full" hideLabel imgWidth={560} />
        </div>
        <div className="absolute top-3 left-3 flex gap-1.5">
          <span className="rounded-full bg-black/70 backdrop-blur-sm">
            <StatusPill tone={status.tone} pulse={status.pulse}>
              {status.label}
            </StatusPill>
          </span>
          {featured && <span className="badge bg-accent-volt text-accent-volt-foreground">Featured</span>}
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-4 p-4">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="truncate text-xs text-muted">
            {t.game} · {t.teamSize}
          </span>
          <span className="line-clamp-2 font-display text-lg leading-tight font-bold tracking-tight">{t.name}</span>
        </div>

        <dl className="mt-auto grid grid-cols-3 gap-2 border-t border-border pt-3">
          <div className="flex min-w-0 flex-col gap-0.5">
            <dt className="text-[10px] font-medium tracking-wide text-muted uppercase">{t.prizeAmount ? "Prize" : "Entry"}</dt>
            <dd className={`text-stat truncate text-sm ${t.prizeAmount ? "text-gold" : t.entryFee === 0 ? "text-success" : ""}`}>
              {t.prizeAmount ? formatNaira(t.prizeAmount) : t.entryFee === 0 ? "Free" : formatNaira(t.entryFee)}
            </dd>
          </div>
          <div className="flex min-w-0 flex-col gap-0.5">
            <dt className="text-[10px] font-medium tracking-wide text-muted uppercase">
              {t.status === "DRAFT" && t.registrationOpenAt ? "Opens" : "Starts"}
            </dt>
            <dd className="text-stat truncate text-sm">
              {formatShortDate(t.status === "DRAFT" && t.registrationOpenAt ? t.registrationOpenAt : t.startAt)}
            </dd>
          </div>
          <div className="flex min-w-0 flex-col gap-0.5">
            <dt className="text-[10px] font-medium tracking-wide text-muted uppercase">Slots</dt>
            <dd className={`text-stat truncate text-sm ${nearlyFull || spotsLeft <= 0 ? "text-accent-orange" : ""}`}>
              {registered}/{t.participantCap}
            </dd>
          </div>
        </dl>
        <div className="-mt-2 h-1 w-full overflow-hidden rounded-full bg-surface-elevated" aria-hidden>
          <div
            className={`h-full rounded-full transition-[width] duration-[var(--duration-reveal)] ${spotsLeft <= 0 || nearlyFull ? "bg-accent-orange" : "bg-accent-blue"}`}
            style={{ width: `${fill}%` }}
          />
        </div>
      </div>
    </Link>
  );
}
