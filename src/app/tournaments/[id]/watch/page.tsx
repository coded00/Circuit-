/**
 * Circuit Watch for one tournament: the main broadcast and every player's stream as channels a viewer can switch
 * between, with the matches being played. The video stays on whichever platform it's hosted on.
 */
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { ChevronLeft, Tv } from "lucide-react";
import { loadWatchHub } from "@/lib/watchHub";
import { WatchHub } from "@/components/streams/WatchHub";

export const metadata = { title: "Circuit Watch", robots: { index: false, follow: true } };

export default async function TournamentWatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Twitch only plays on a page whose domain it has been told about, so the player is told this one's.
  const parentHost = ((await headers()).get("host") ?? "localhost").split(":")[0];
  const hub = await loadWatchHub(id, parentHost);
  if (!hub) notFound();
  const live = hub.tournament.status === "LIVE";

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-5 px-4 py-6 sm:px-8 sm:py-10">
      <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-sm text-muted">
        <Link href={`/tournaments/${hub.tournament.id}`} className="flex items-center gap-1 transition hover:text-foreground">
          <ChevronLeft size={16} /> {hub.tournament.name}
        </Link>
      </nav>

      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-1 border-b border-border pb-4">
        <div className="min-w-0">
          <p className="text-sm text-muted">
            {hub.tournament.game} · Circuit Watch
          </p>
          <h1 className="font-display text-2xl leading-[1.05] font-bold tracking-tight uppercase sm:text-4xl">{hub.tournament.name}</h1>
        </div>
        {live && <span className="cut-xs bg-danger px-2.5 py-1 text-xs font-bold tracking-wide text-white uppercase">On air</span>}
      </header>

      {hub.channels.length === 0 ? (
        <div className="card state-block">
          <Tv size={32} className="text-muted" aria-hidden />
          <h2 className="state-title">No streams yet</h2>
          <p className="state-description">The organizer and players haven&apos;t added a stream for this tournament. Check back when it starts.</p>
          <Link href={`/tournaments/${hub.tournament.id}`} className="btn-secondary">
            Back to the tournament
          </Link>
        </div>
      ) : (
        <WatchHub channels={hub.channels} matches={hub.matches} />
      )}
    </div>
  );
}
