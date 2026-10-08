/**
 * Circuit — Health check.
 *
 * Two callers want two different things from this route, and finding #16 is that it was answering
 * both of them to anyone who asked.
 *
 * - An **uptime monitor** — Vercel, Railway, BetterStack — is unauthenticated and wants one bit: is
 *   this deployment serving. It gets the status code and `{ status }`, and nothing else.
 * - An **operator** wants the posture: which integrations the running process can actually see, which
 *   storage driver is live, how slow the database is. That is a description of the deployment, and it
 *   is useful to somebody deciding where to aim, so it is staff-only now.
 *
 * What the public half deliberately no longer says, and why each was worth taking off it:
 *
 * - `checks.integrations.*` — `cronSecret: false` says the sweep is not running, which means
 *   tournaments never start on their deadline, unanswered results are never auto-accepted, disputes
 *   never escalate and stuck transfers are never reconciled. That is a list of what will not happen.
 * - `checks.storage.driver` — whether uploads land on a bucket or on this server's own disk decides
 *   which of the two is worth probing.
 * - `latencyMs` and `uptimeSeconds` — a load oracle, and a "when did you last deploy" respectively.
 *
 * The database's reachability does stay public, in the status code, because a health check that
 * reports healthy while the database is down is not a health check. Answering 503 *is* the
 * disclosure; how many milliseconds the query took is not.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Never cached — by a CDN, by a proxy, or by the browser. A cached 200 from a healthy minute would
 *  go on reporting healthy straight through an outage, which is the one failure this endpoint exists
 *  to catch. Sent on both responses: which one a given caller gets depends on their session, so a
 *  shared cache holding either would be a bug in its own right. */
const NO_STORE = { "Cache-Control": "no-store" };

export async function GET() {
  const startTime = Date.now();
  let dbStatus = "connected";
  let dbLatencyMs = 0;
  let healthy = true;

  try {
    const dbStart = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    dbLatencyMs = Date.now() - dbStart;
  } catch (err) {
    dbStatus = "disconnected";
    healthy = false;
    console.error("[health] Database healthcheck failed:", err);
  }

  const status = healthy ? 200 : 503;

  // Resolving a session reads the User row, so this hits the same database the check above just
  // watched fail — and throws when it is down, which would turn the response into a 500 that tells a
  // monitor nothing. Guarded for exactly that reason: with the database unreachable, an anonymous
  // 503 is the answer, whoever is asking.
  let isStaff = false;
  try {
    isStaff = Boolean((await getCurrentUser())?.isStaff);
  } catch {
    isStaff = false;
  }

  if (!isStaff) {
    return NextResponse.json(
      { status: healthy ? "healthy" : "degraded", timestamp: new Date().toISOString() },
      { status, headers: NO_STORE }
    );
  }

  const isR2Configured = Boolean(
    (process.env.R2_BUCKET || process.env.S3_BUCKET) &&
    (process.env.R2_ENDPOINT || process.env.S3_ENDPOINT || process.env.R2_ACCOUNT_ID) &&
    (process.env.R2_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID) &&
    (process.env.R2_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY)
  );

  const payload = {
    status: healthy ? "healthy" : "degraded",
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    latencyMs: Date.now() - startTime,
    checks: {
      database: {
        status: dbStatus,
        latencyMs: dbLatencyMs,
      },
      storage: {
        driver: isR2Configured ? "R2_S3" : "LOCAL_DISK",
      },
      integrations: {
        paystack: Boolean(process.env.PAYSTACK_SECRET_KEY),
        flutterwave: Boolean(process.env.FLUTTERWAVE_SECRET_KEY),
        resend: Boolean(process.env.RESEND_API_KEY),
        onesignal: Boolean(process.env.ONESIGNAL_API_KEY),
        cronSecret: Boolean(process.env.CRON_SECRET),
      },
    },
  };

  return NextResponse.json(payload, { status, headers: NO_STORE });
}
