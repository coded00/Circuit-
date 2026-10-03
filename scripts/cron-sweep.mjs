#!/usr/bin/env node
/**
 * Circuit — runs the scheduled sweep (/api/cron/sweep) on a self-hosted
 * server, where Vercel Cron (vercel.json) doesn't exist. The sweep closes
 * registration at the deadline and starts brackets/lobbies, auto-accepts
 * unanswered results, escalates stale disputes and settles organizer
 * revenue — without it those only happen when something else triggers
 * them. See docs/self-hosting.md.
 *
 * Needs CRON_SECRET (the same value the app has). Calls the app at
 * SWEEP_URL, or http://localhost:$PORT (default 3000), so it never leaves
 * the machine.
 *
 *   One run (for cron):   node --env-file=.env scripts/cron-sweep.mjs
 *   Keep running (pm2 /   node --env-file=.env scripts/cron-sweep.mjs --every 120
 *   Docker / no cron):
 *
 * Exits non-zero on failure in one-run mode, so cron can report it.
 */

const secret = process.env.CRON_SECRET;
const base = (process.env.SWEEP_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, "");
const everyArg = process.argv.indexOf("--every");
const everySeconds = everyArg > -1 ? Number(process.argv[everyArg + 1]) : null;

if (!secret) {
  console.error("[sweep] CRON_SECRET isn't set — add it to the server's .env (the app needs the same value).");
  process.exit(1);
}
if (everySeconds !== null && (!Number.isFinite(everySeconds) || everySeconds < 30)) {
  console.error("[sweep] --every needs a number of seconds, at least 30.");
  process.exit(1);
}

async function sweepOnce() {
  const started = new Date().toISOString();
  try {
    const res = await fetch(`${base}/api/cron/sweep`, { headers: { authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(110_000) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body.success === false) {
      console.error(`[sweep] ${started} failed: HTTP ${res.status} ${body.error ?? ""}`.trim());
      return false;
    }
    const { success: _s, timestamp: _t, durationMs, ...counts } = body;
    const busy = Object.entries(counts).filter(([, v]) => typeof v === "number" && v > 0);
    console.log(`[sweep] ${started} ok in ${durationMs}ms${busy.length ? " — " + busy.map(([k, v]) => `${k}: ${v}`).join(", ") : ""}`);
    return true;
  } catch (err) {
    console.error(`[sweep] ${started} couldn't reach ${base}: ${err instanceof Error ? err.message : err}`);
    return false;
  }
}

if (everySeconds === null) {
  process.exit((await sweepOnce()) ? 0 : 1);
} else {
  console.log(`[sweep] running every ${everySeconds}s against ${base}`);
  for (;;) {
    await sweepOnce();
    await new Promise((r) => setTimeout(r, everySeconds * 1000));
  }
}
