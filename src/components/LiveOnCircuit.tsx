import Link from "next/link";
import { Eye, BadgeCheck } from "lucide-react";
import { GameArtTile } from "@/components/GameArtTile";
import { SpotlightCarousel } from "@/components/SpotlightCarousel";
import { STREAMER_PORTRAIT_IMAGES, unsplashUrl } from "@/lib/gameImagery";

/**
 * Circuit — "Live on Circuit" homepage section (Phases 6+7 of the CIRCUIT
 * UI spec). Circuit has no streaming backend at all — no broadcast
 * capability, no viewer/follower tracking. Per explicit product decision
 * this ships as fully static illustrative content (streamer names,
 * viewer counts, stream titles are all invented), the one deliberate
 * exception to Circuit's usual "never fake data" convention. Nothing here
 * reads from the database and nothing links anywhere real except the
 * section's own /watch destination.
 */

type Stream = {
  streamer: string;
  game: string;
  title: string;
  viewers: string;
  tags: string[];
  portrait: string;
};

const FEATURED_CANDIDATES: Stream[] = [
  {
    streamer: "Kage",
    game: "Call of Duty: Warzone",
    title: "Road to Top 100 | Warzone Ranked Grind",
    viewers: "24.8K",
    tags: ["Call of Duty", "English", "FPS", "Ranked"],
    portrait: STREAMER_PORTRAIT_IMAGES[0],
  },
  {
    streamer: "Amara",
    game: "Valorant",
    title: "Radiant Grind | Duo Queue Chaos",
    viewers: "16.3K",
    tags: ["Valorant", "English", "FPS", "Ranked"],
    portrait: STREAMER_PORTRAIT_IMAGES[1],
  },
  {
    streamer: "Deji",
    game: "EA FC 25",
    title: "Weekend League | Road to Top 100",
    viewers: "11.7K",
    tags: ["EA FC 25", "English", "Sports"],
    portrait: STREAMER_PORTRAIT_IMAGES[2],
  },
];

const STREAM_LIST: Stream[] = [
  {
    streamer: "LunaRise",
    game: "Fortnite",
    title: "Fortnite Ranked",
    viewers: "18.2K",
    tags: ["Fortnite", "English"],
    portrait: STREAMER_PORTRAIT_IMAGES[1],
  },
  {
    streamer: "Tobi",
    game: "EA FC 25",
    title: "EA FC Champions",
    viewers: "12.4K",
    tags: ["EA FC 25"],
    portrait: STREAMER_PORTRAIT_IMAGES[2],
  },
  {
    streamer: "ShadyFPS",
    game: "Valorant",
    title: "Valorant Immortal Grind",
    viewers: "9.8K",
    tags: ["Valorant"],
    portrait: STREAMER_PORTRAIT_IMAGES[0],
  },
];

function StreamerAvatar({ name, size = 32 }: { name: string; size?: number }) {
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full border-2 border-accent-blue/40 bg-surface-elevated font-semibold text-muted"
      style={{ height: size, width: size, fontSize: size * 0.4 }}
    >
      {name.slice(0, 1).toUpperCase()}
    </div>
  );
}

function StreamTag({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-surface-elevated px-2 py-0.5 text-[10px] text-muted">{children}</span>;
}

function FeaturedStreamSlide({ stream }: { stream: Stream }) {
  return (
    <Link href="/watch" className="card-media relative flex h-72 w-full flex-col justify-end">
      <GameArtTile game={stream.game} fill imgWidth={900} />

      <span className="badge badge-live absolute top-3 left-3 z-10">
        <span className="live-dot" aria-hidden />
        LIVE
      </span>
      <span className="absolute top-3 right-3 z-10 flex items-center gap-1 rounded-full bg-black/50 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-sm">
        <Eye size={12} />
        {stream.viewers}
      </span>

      {/* Facecam overlay — a real portrait standing in for the streamer's
          webcam feed (the stream itself is illustrative, see this file's
          header comment). Border uses the real "live" token, matching the
          LIVE badge right above it, not the retired brand-violet one. */}
      <div
        className="absolute top-14 right-4 z-10 h-16 w-16 overflow-hidden rounded-lg border-2 border-live/60 sm:h-20 sm:w-20"
        style={{ boxShadow: "0 8px 24px rgba(0,0,0,0.4)" }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- external CDN */}
        <img src={unsplashUrl(stream.portrait, 200)} alt="" className="h-full w-full object-cover" />
      </div>

      <div className="relative z-10 flex flex-col gap-2 bg-gradient-to-t from-black/80 to-transparent p-4 pt-10">
        <div className="flex items-center gap-2">
          <StreamerAvatar name={stream.streamer} />
          <span className="flex items-center gap-1 text-sm font-semibold text-white">
            {stream.streamer}
            <BadgeCheck size={14} className="text-accent-blue" />
          </span>
        </div>
        <span className="text-sm text-white/85">{stream.title}</span>
        <div className="flex flex-wrap gap-1.5">
          {stream.tags.map((tag) => (
            <StreamTag key={tag}>{tag}</StreamTag>
          ))}
        </div>
      </div>
    </Link>
  );
}

export function LiveOnCircuit() {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-section-heading flex items-center gap-2">
            <span className="live-dot" aria-hidden />
            Live on Circuit
          </h2>
          <p className="text-metadata">Watch what&apos;s happening across the Circuit right now.</p>
        </div>
        <Link href="/watch" className="text-xs font-medium text-accent-blue hover:underline">
          View All →
        </Link>
      </div>

      <div className="flex flex-col gap-4 lg:flex-row">
        {/* Featured stream — ~60% width on desktop, rotates automatically
            among a few illustrative streams (real, distinct portrait
            photos so the facecam doesn't repeat the same face). */}
        <div className="lg:w-[60%]">
          <SpotlightCarousel
            ariaLabel="Featured live stream"
            items={FEATURED_CANDIDATES.map((s) => (
              <FeaturedStreamSlide key={s.streamer} stream={s} />
            ))}
          />
        </div>

        {/* Compact live stream list — Phase 7 */}
        <div className="flex flex-col gap-3 lg:w-[40%]">
          {STREAM_LIST.map((stream) => (
            <Link key={stream.streamer} href="/watch" className="card-row flex h-full min-h-[100px] gap-3 p-2.5">
              <div className="relative h-full w-24 shrink-0 overflow-hidden rounded-[8px] sm:w-28">
                <GameArtTile game={stream.game} className="h-full w-full" />
                <span className="badge badge-live absolute top-1.5 left-1.5 px-1.5 py-0.5 text-[9px]">
                  <span className="live-dot" aria-hidden />
                  LIVE
                </span>
                <span className="absolute top-1.5 right-1.5 flex items-center gap-0.5 rounded-full bg-black/60 px-1.5 py-0.5 text-[9px] font-medium text-white">
                  <Eye size={9} />
                  {stream.viewers}
                </span>
              </div>
              <div className="flex min-w-0 flex-col justify-center gap-1">
                <div className="flex items-center gap-1.5">
                  <StreamerAvatar name={stream.streamer} size={20} />
                  <span className="flex items-center gap-1 truncate text-sm font-semibold">
                    {stream.streamer}
                    <BadgeCheck size={12} className="shrink-0 text-accent-blue" />
                  </span>
                </div>
                <span className="truncate text-xs text-muted">{stream.title}</span>
                <div className="flex flex-wrap gap-1">
                  {stream.tags.map((tag) => (
                    <StreamTag key={tag}>{tag}</StreamTag>
                  ))}
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
