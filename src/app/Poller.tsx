"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** V1's "live" pages, polling-style rather than a WebSocket — see
 *  docs/circuit-stack.md's Live-ish updates section for why. Used by the
 *  bracket view (BRK-7) and the open Battle board (BTL-2). */
export default function Poller({ intervalMs = 5000 }: { intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    const interval = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(interval);
  }, [router, intervalMs]);

  return null;
}
