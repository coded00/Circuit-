"use client";

/**
 * Circuit — Level 3 of the motion hierarchy (globals.css's Phase 20
 * comment has the full breakdown): a real "MATCH FOUND" loading HUD for
 * major moments, not a page-transition flourish. First use: tournament
 * registration success (RegistrationForm.tsx) — reveals the tournament
 * page, now showing the viewer as registered, once loading completes.
 *
 * The bordered-panel-with-dividers look is real CSS (border-t rules),
 * not literal box-drawing characters — those were shorthand for the
 * shape, not the actual render.
 */

import { useEffect, useState } from "react";
import { motion } from "framer-motion";

const LOAD_DURATION_MS = 900;

export function MatchFoundHud({ onComplete }: { onComplete: () => void }) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const start = performance.now();
    let frame: number;
    function tick(now: number) {
      const pct = Math.min(100, Math.round(((now - start) / LOAD_DURATION_MS) * 100));
      setProgress(pct);
      if (pct < 100) {
        frame = requestAnimationFrame(tick);
      } else {
        setTimeout(onComplete, 150);
      }
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [onComplete]);

  return (
    <motion.div
      data-surface="dark"
      className="fixed inset-0 z-50 flex items-center justify-center bg-background"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        className="flex w-full max-w-xs flex-col items-center gap-4 px-6 text-center"
      >
        <div className="w-full border-t border-accent-volt/40" />
        <div className="flex flex-col gap-1">
          <span className="text-eyebrow text-muted-strong">Circuit</span>
          <span className="font-display text-3xl font-bold tracking-tight text-accent-volt uppercase">Match Found</span>
        </div>
        <div className="w-full border-t border-accent-volt/40" />

        <div className="flex w-full flex-col gap-2">
          <span className="font-mono text-sm font-semibold tracking-widest text-foreground uppercase tabular-nums">
            Loading {progress}%
          </span>
          <div className="h-1 w-full overflow-hidden rounded-full bg-surface-elevated">
            <div className="h-full bg-accent-volt transition-[width] duration-100 ease-linear" style={{ width: `${progress}%` }} />
          </div>
        </div>

        <div className="w-full border-t border-accent-volt/40" />
      </motion.div>
    </motion.div>
  );
}
