/**
 * Circuit — auto-opens a Tournament once its own `registrationOpenAt`
 * arrives. Creation (`POST /api/tournaments`) computes
 * `status: registrationOpenAt <= now ? "OPEN" : "DRAFT"` exactly once at
 * create time, but nothing ever re-evaluated it as time passed — a
 * tournament whose organizer picked a future registration-open date (the
 * normal flow, not an edge case) stayed DRAFT forever, invisible to
 * every OPEN/LIVE-only query (homepage, /compete, ladder's game filter,
 * ...), with no publish action anywhere in the product to fix it.
 *
 * Same "check live at the read, there's no cron sweep to run this yet"
 * convention docs/circuit-stack.md's Scheduled work section already
 * settled on for REG-3's registration auto-close. Called at the top of
 * every page that lists or shows tournaments, so a due DRAFT tournament
 * flips to OPEN — a real, persisted status change, not just a
 * query-time illusion — the next time anyone looks.
 */

import { prisma } from "@/lib/db";

// Every page that lists tournaments calls this, so on a busy site it would be a
// database write per page view. Once every 20 seconds per server is plenty: a
// tournament opening a few seconds late is invisible, a pool of connections
// stuck behind these writes is not.
let lastOpenSweep = 0;

export async function openDueTournaments(): Promise<void> {
  const now = Date.now();
  if (now - lastOpenSweep < 20_000) return;
  lastOpenSweep = now;
  await prisma.tournament.updateMany({
    where: { status: "DRAFT", registrationOpenAt: { lte: new Date() } },
    data: { status: "OPEN" },
  });
}
