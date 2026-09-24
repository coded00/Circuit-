/**
 * Circuit — one open Challenge as a lobby row (game, host, format, stake,
 * age, Accept). Shared by the /battles board and the homepage's Open
 * Challenges panel so both read the same.
 */

import Link from "next/link";
import { ArrowRight, Swords, Users } from "lucide-react";
import { GameArtTile } from "@/components/GameArtTile";
import { panelRowClass } from "@/components/ui/Panel";
import { PlayerAvatar } from "@/components/ui/PlayerAvatar";

export type ChallengeRowData = {
  id: string;
  game: string;
  format: string;
  visibility: string;
  stakeAmount: number;
  createdAt: Date;
  creator: { displayName: string; avatarUrl: string | null };
};

function formatNaira(kobo: number): string {
  return `₦${(kobo / 100).toLocaleString("en-NG", { minimumFractionDigits: 0 })}`;
}

const relative = new Intl.RelativeTimeFormat("en", {
  numeric: "auto",
  style: "short",
});
function timeAgo(date: Date): string {
  const minutes = Math.round((date.getTime() - Date.now()) / 60000);
  if (Math.abs(minutes) < 60) return relative.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return relative.format(hours, "hour");
  return relative.format(Math.round(hours / 24), "day");
}

export function ChallengeRow({ battle: b, mine = false }: { battle: ChallengeRowData; mine?: boolean }) {
  return (
    <Link href={`/battles/${b.id}`} className={`${panelRowClass} py-3.5`}>
      <GameArtTile game={b.game} className="h-11 w-11 shrink-0 rounded-[10px]" hideLabel imgWidth={120} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex min-w-0 items-center gap-2">
          <PlayerAvatar person={b.creator} size="xs" />
          <span className="truncate text-sm font-semibold">{b.creator.displayName}</span>
          {mine && <span className="badge bg-accent-volt-soft text-foreground">Yours</span>}
        </div>
        <span className="text-metadata flex min-w-0 items-center gap-1.5">
          <span className="truncate">{b.game}</span>
          <span aria-hidden>·</span>
          <span className="flex shrink-0 items-center gap-1">
            <Swords size={11} />
            {b.format === "BEST_OF_3" ? "Bo3" : "Single"}
          </span>
          {b.visibility === "FRIENDS" && (
            <>
              <span aria-hidden>·</span>
              <span className="flex shrink-0 items-center gap-1">
                <Users size={11} />
                Friends
              </span>
            </>
          )}
          <span aria-hidden className="hidden sm:inline">
            ·
          </span>
          <span className="hidden shrink-0 sm:inline">{timeAgo(b.createdAt)}</span>
        </span>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-0.5">
        <span className={`text-stat text-sm ${b.stakeAmount > 0 ? "text-gold" : "text-muted"}`}>
          {b.stakeAmount > 0 ? formatNaira(b.stakeAmount) : "Free"}
        </span>
        <span className="text-[11px] text-muted sm:hidden">{timeAgo(b.createdAt)}</span>
      </div>
      <span
        className={`hidden shrink-0 items-center gap-1 rounded-[var(--radius-control)] px-3.5 py-2 text-sm font-semibold transition sm:flex ${
          mine
            ? "border border-border-strong text-foreground"
            : "bg-accent-volt text-accent-volt-foreground group-hover:brightness-95"
        }`}
      >
        {mine ? "View" : "Accept"}
        <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}
