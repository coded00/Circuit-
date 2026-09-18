"use client";

/**
 * Circuit Video Feed — YouTube playback (Phase 3). Renders the official
 * `youtube.com/embed` iframe and drives it with the embed's own
 * `postMessage` command protocol (play/pause/mute) — no YouTube IFrame
 * API script load needed for anything this simple, so no extra
 * dependency. This is the only legal way to play a YouTube video inside
 * Circuit: no download, no rehosting, attribution stays intact (the
 * badge/author line lives in `VideoCard`, outside this component).
 */

import { useEffect, useRef, useState } from "react";

function postCommand(iframe: HTMLIFrameElement | null, func: string, args: unknown[] = []) {
  iframe?.contentWindow?.postMessage(JSON.stringify({ event: "command", func, args }), "*");
}

export function YouTubeEmbed({
  videoId,
  shouldPlay,
  muted,
}: {
  videoId: string;
  shouldPlay: boolean;
  muted: boolean;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.source !== iframeRef.current?.contentWindow) return;
      try {
        const data = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
        if (data?.event === "onReady" || data?.event === "initialDelivery") setReady(true);
      } catch {
        // Non-JSON messages from other embeds on the page — ignore.
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  // The embed stays silent — no `onReady`, nothing — until the parent
  // sends this handshake first. Load timing is racy (the iframe's inner
  // script isn't necessarily parsed yet when `onLoad` fires, and a
  // backgrounded/unfocused tab throttles `setInterval` further still), so
  // this keeps retrying for as long as it takes rather than giving up
  // after a fixed window — a harmless extra postMessage the embed ignores
  // once it's already listening is strictly better than a card that never
  // recovers because it happened to still be loading past a timeout.
  useEffect(() => {
    if (ready) return;
    const interval = setInterval(() => {
      iframeRef.current?.contentWindow?.postMessage(JSON.stringify({ event: "listening", id: videoId }), "*");
    }, 250);
    return () => clearInterval(interval);
  }, [ready, videoId]);

  useEffect(() => {
    if (!ready) return;
    postCommand(iframeRef.current, shouldPlay ? "playVideo" : "pauseVideo");
  }, [ready, shouldPlay]);

  useEffect(() => {
    if (!ready) return;
    postCommand(iframeRef.current, muted ? "mute" : "unMute");
  }, [ready, muted]);

  const src = `https://www.youtube.com/embed/${videoId}?autoplay=0&mute=1&loop=1&playlist=${videoId}&controls=0&modestbranding=1&playsinline=1&enablejsapi=1&rel=0`;

  return (
    <iframe
      ref={iframeRef}
      src={src}
      title="YouTube video"
      className="absolute inset-0 h-full w-full"
      allow="autoplay; encrypted-media; picture-in-picture"
      // Clicks land on VideoCard's own overlay (tap-to-pause etc.), not the
      // embed's own chrome — controls=0 already hides YouTube's UI.
      style={{ pointerEvents: "none" }}
    />
  );
}
