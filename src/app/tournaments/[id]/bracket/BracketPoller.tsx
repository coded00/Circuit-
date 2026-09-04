"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** BRK-7's "live" bracket, V1-style: polling, not a WebSocket — see
 *  docs/circuit-stack.md's Live-ish updates section for why. */
export default function BracketPoller() {
  const router = useRouter();

  useEffect(() => {
    const interval = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(interval);
  }, [router]);

  return null;
}
