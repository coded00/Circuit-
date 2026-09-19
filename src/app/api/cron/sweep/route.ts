/**
 * Circuit — the scheduled sweep (Build Plan P3-6, BRK-6's timeout,
 * BRK-1's deadline path). See docs/circuit-stack.md's Scheduled work
 * section for the design this implements: one periodic route, not a job
 * queue. Not actually wired to a scheduler yet — there's no deployment
 * target for Vercel Cron until this ships somewhere. Whoever sets that up
 * calls this route with `Authorization: Bearer $CRON_SECRET`.
 */

import { NextResponse } from "next/server";
import { runScheduledSweep } from "@/lib/matches";

async function handleSweep(request: Request) {
  const secret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");

  // Vercel Cron automatically includes `Authorization: Bearer <CRON_SECRET>`
  // when CRON_SECRET is configured in project environment variables.
  if (!secret || authHeader !== `Bearer ${secret}`) {
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

