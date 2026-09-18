"use client";

/**
 * Circuit Video Feed — a single full-bleed video slide. Autoplay/pause is
 * entirely driven by the `isActive` prop `FeedClient` computes from
 * intersection ratios (one source of truth, so exactly one video ever
 * plays at once — spec section 8). Tapping the video itself toggles a
 * local "user paused" override that autoplay respects until the card
 * leaves and re-enters the viewport.
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Heart, Bookmark, Share2, Volume2, VolumeX, Play, Trophy, Gamepad2, Check } from "lucide-react";
import { GameArtTile } from "@/components/GameArtTile";
import { gamePath, tournamentPath, videoPath, absoluteUrl } from "@/lib/seo";
import { extractYouTubeId } from "@/lib/youtube";
import { YouTubeEmbed } from "./YouTubeEmbed";
import type { FeedVideo } from "@/lib/videos";

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export function VideoCard({
  video,
  isActive,
  muted,
  onToggleMute,
  onVisibilityChange,
  currentUserId,
  preload,
}: {
  video: FeedVideo;
  isActive: boolean;
  muted: boolean;
  onToggleMute: () => void;
  onVisibilityChange: (id: string, ratio: number) => void;
  currentUserId: string | null;
  preload: "auto" | "metadata" | "none";
}) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [userPaused, setUserPaused] = useState(false);
  const [liked, setLiked] = useState(video.likedByMe);
  const [likeCount, setLikeCount] = useState(video.likes);
  const [saved, setSaved] = useState(video.savedByMe);
  const [copied, setCopied] = useState(false);
  // A ref, not state: it only guards against double-firing the view POST
  // and never needs to trigger a re-render.
  const viewCountedRef = useRef(false);
  const youTubeId = video.source === "YOUTUBE" && video.sourceUrl ? extractYouTubeId(video.sourceUrl) : null;

  // One IntersectionObserver per card reports its own visibility ratio up
  // to FeedClient, which decides which single card is "active" — keeps
  // the play/pause decision centralized instead of every card guessing.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => onVisibilityChange(video.id, entry.isIntersecting ? entry.intersectionRatio : 0),
      { threshold: [0, 0.25, 0.5, 0.6, 0.75, 1] }
    );
    observer.observe(el);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onVisibilityChange is stable (useCallback in parent)
  }, [video.id]);

  // Native `<video>` play/pause — the YouTube embed drives its own
  // playback from the `shouldPlay` prop instead (see YouTubeEmbed).
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (isActive && !userPaused) el.play().catch(() => undefined);
    else el.pause();
  }, [isActive, userPaused]);

  // View counting is player-agnostic — fires once per video per session
  // the moment it becomes the active card, regardless of source.
  useEffect(() => {
    if (!isActive || viewCountedRef.current) return;
    viewCountedRef.current = true;
    const key = `circuit-feed-viewed:${video.id}`;
    if (!sessionStorage.getItem(key)) {
      sessionStorage.setItem(key, "1");
      fetch(`/api/videos/${video.id}/view`, { method: "POST" }).catch(() => undefined);
    }
  }, [isActive, video.id]);

  // Autoplay policies require starting muted; once active, keep the
  // element's own muted state in sync with the session-wide preference.
  // Some browsers pause an already-autoplaying video the instant it's
  // unmuted via script — re-assert play() right after if this card is
  // still meant to be the active, playing one.
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.muted = muted;
    if (isActive && !userPaused) el.play().catch(() => undefined);
  }, [muted, isActive, userPaused]);

  function getLoginRedirect() {
    const path = typeof window !== "undefined" ? window.location.pathname + window.location.search : "/ladder";
    return `/login?next=${encodeURIComponent(path)}`;
  }

  async function handleLike() {
    if (!currentUserId) {
      router.push(getLoginRedirect());
      return;
    }
    const nextLiked = !liked;
    setLiked(nextLiked);
    setLikeCount((c) => c + (nextLiked ? 1 : -1));
    try {
      const res = await fetch(`/api/videos/${video.id}/like`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setLiked(data.liked);
        setLikeCount(data.likes);
      }
    } catch {
      setLiked(!nextLiked);
      setLikeCount((c) => c + (nextLiked ? -1 : 1));
    }
  }

  async function handleSave() {
    if (!currentUserId) {
      router.push(getLoginRedirect());
      return;
    }
    const nextSaved = !saved;
    setSaved(nextSaved);
    try {
      const res = await fetch(`/api/videos/${video.id}/save`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setSaved(data.saved);
      }
    } catch {
      setSaved(!nextSaved);
    }
  }

  async function handleShare() {
    const url = absoluteUrl(videoPath(video));
    fetch(`/api/videos/${video.id}/share`, { method: "POST" }).catch(() => undefined);
    if (typeof navigator !== "undefined" && navigator.share) {
      navigator.share({ title: video.title, url }).catch(() => undefined);
    } else if (typeof navigator !== "undefined" && navigator.clipboard) {
      await navigator.clipboard.writeText(url).catch(() => undefined);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <div ref={containerRef} className="relative flex h-full w-full shrink-0 snap-start items-center justify-center bg-black">
      <div className="relative h-full w-full sm:aspect-[9/16] sm:h-full sm:w-auto">
        {video.game && (
          <div className="absolute inset-0" aria-hidden>
            <GameArtTile game={video.game} className="h-full w-full" hideLabel />
          </div>
        )}
        {youTubeId ? (
          <>
            <YouTubeEmbed videoId={youTubeId} shouldPlay={isActive && !userPaused} muted={muted} />
            {/* The embed itself is pointer-events:none (its own chrome is
                already hidden via controls=0) — this transparent layer is
                what actually catches the tap-to-pause gesture, since a
                cross-origin iframe can't bubble a click into our React tree. */}
            <button
              type="button"
              aria-label={userPaused ? "Play" : "Pause"}
              className="absolute inset-0 h-full w-full cursor-default"
              onClick={() => setUserPaused((p) => !p)}
            />
          </>
        ) : (
          video.videoUrl && (
            <video
              ref={videoRef}
              src={video.videoUrl}
              className="absolute inset-0 h-full w-full object-cover"
              loop
              playsInline
              muted={muted}
              preload={preload}
              onClick={() => setUserPaused((p) => !p)}
            />
          )
        )}

        {userPaused && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <Play size={56} className="text-white/90 drop-shadow-lg" fill="currentColor" />
          </div>
        )}

        <div
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-1/2"
          style={{ backgroundImage: "linear-gradient(to top, rgba(0,0,0,0.85), transparent)" }}
        />

        {/* Bottom-left: title/description/tags/attribution/discovery links */}
        <div className="absolute right-16 bottom-4 left-4 z-10 flex flex-col gap-2 text-white sm:right-20">
          {video.source === "YOUTUBE" ? (
            <span className="w-fit rounded-full bg-black/50 px-2.5 py-1 text-[10px] font-semibold tracking-wide uppercase backdrop-blur-sm">
              Powered by YouTube{video.sourceAuthor ? ` · ${video.sourceAuthor}` : ""}
            </span>
          ) : (
            <span className="w-fit rounded-full bg-accent-volt/90 px-2.5 py-1 text-[10px] font-semibold tracking-wide text-accent-volt-foreground uppercase">
              Circuit
            </span>
          )}
          <span className="font-display text-base leading-snug font-bold drop-shadow-sm">{video.title}</span>
          {video.description && <span className="line-clamp-2 text-sm text-white/85">{video.description}</span>}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {video.game && (
              <Link
                href={gamePath(video.game)}
                className="flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 text-xs font-medium backdrop-blur-sm transition hover:bg-white/25"
              >
                <Gamepad2 size={12} />
                {video.game}
              </Link>
            )}
            {video.tournament && (
              <Link
                href={tournamentPath(video.tournament)}
                className="flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 text-xs font-medium backdrop-blur-sm transition hover:bg-white/25"
              >
                <Trophy size={12} />
                View Tournament
              </Link>
            )}
          </div>
        </div>

        {/* Right rail: interactions */}
        <div className="absolute right-3 bottom-4 z-10 flex flex-col items-center gap-4">
          <button
            type="button"
            onClick={handleLike}
            className="flex flex-col items-center gap-1 text-white transition active:scale-90"
            aria-pressed={liked}
            aria-label="Like"
          >
            <Heart size={26} className={liked ? "fill-accent-orange text-accent-orange" : ""} />
            <span className="text-[11px] font-semibold drop-shadow-sm">{formatCount(likeCount)}</span>
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="flex flex-col items-center gap-1 text-white transition active:scale-90"
            aria-pressed={saved}
            aria-label="Save"
          >
            <Bookmark size={24} className={saved ? "fill-accent-volt text-accent-volt" : ""} />
            <span className="text-[11px] font-semibold drop-shadow-sm">Save</span>
          </button>
          <button
            type="button"
            onClick={handleShare}
            className="flex flex-col items-center gap-1 text-white transition active:scale-90"
            aria-label={copied ? "Link copied" : "Share"}
          >
            {copied ? <Check size={24} className="text-accent-volt drop-shadow-sm" /> : <Share2 size={24} />}
            <span className={`text-[11px] font-semibold drop-shadow-sm ${copied ? "text-accent-volt" : ""}`}>
              {copied ? "Copied" : "Share"}
            </span>
          </button>
          <button
            type="button"
            onClick={onToggleMute}
            className="flex flex-col items-center gap-1 text-white transition active:scale-90"
            aria-label={muted ? "Unmute" : "Mute"}
          >
            {muted ? <VolumeX size={22} /> : <Volume2 size={22} />}
          </button>
        </div>
      </div>
    </div>
  );
}
