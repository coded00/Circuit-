/**
 * Circuit — the scheduled sweep (Build Plan P3-6, BRK-6's timeout,
 * BRK-1's deadline path). See docs/circuit-stack.md's Scheduled work
 * section for the design this implements: one periodic route, not a job
 * queue. Called every 5 minutes by .github/workflows/sweep.yml (Vercel's
 * free plan only allows a daily cron, so there is no `crons` entry in
 * vercel.json); it only fires once the app is deployed and the workflow's
 * APP_URL and CRON_SECRET secrets are set (docs/pre-launch-checklist.md's
 * cron verification step covers confirming it). Whatever calls this route
 * must send `Authorization: Bearer $CRON_SECRET`.
 */

import { NextResponse } from "next/server";
import { runScheduledSweep } from "@/lib/matches";
import { captureException } from "@/lib/observability";
import { timingSafeEqual } from "crypto";

// Constant-time comparison, so response timing can't be used to guess the secret byte by byte.
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

async function handleSweep(request: Request) {
  const secret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");

  // Vercel Cron automatically includes `Authorization: Bearer <CRON_SECRET>`
  // when CRON_SECRET is configured in project environment variables.
  if (!secret || !authHeader || !safeEqual(authHeader, `Bearer ${secret}`)) {
    return NextResponse.json(
      { error: "Unauthorized. Provide valid Bearer token in Authorization header." },
      { status: 401 }
    );
  }

  const startTime = Date.now();
  try {
    const result = await runScheduledSweep();
    const durationMs = Date.now() - startTime;

    return NextResponse.json({
      success: true,
      durationMs,
      timestamp: new Date().toISOString(),
      ...result,
    });
  } catch (error) {
    const durationMs = Date.now() - startTime;
    console.error("[cron/sweep] Unexpected failure during scheduled sweep:", error);
    // A failure that escapes runScheduledSweep's own per-item try/catches
    // means the whole sweep run failed outright — even more worth
    // knowing about than a single item's failure (which is already
    // captured inside runScheduledSweep itself).
    captureException(error, { source: "cron/sweep", durationMs });
    return NextResponse.json(
      {
        success: false,
        durationMs,
        error: error instanceof Error ? error.message : "Internal sweep failure",
      },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  return handleSweep(request);
}

export async function POST(request: Request) {
  return handleSweep(request);
}

