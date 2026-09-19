/**
 * Circuit — Production Health Check & Diagnostics Endpoint.
 *
 * Provides a lightweight health check suitable for Vercel, Railway,
 * BetterStack, or external uptime monitors.
 *
 * Returns 200 OK if healthy, or 503 Service Unavailable if the database is down.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

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

  const isR2Configured = Boolean(
    (process.env.R2_BUCKET || process.env.S3_BUCKET) &&
    (process.env.R2_ENDPOINT || process.env.S3_ENDPOINT || process.env.R2_ACCOUNT_ID) &&
    (process.env.R2_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID) &&
    (process.env.R2_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY)
  );

  const totalDurationMs = Date.now() - startTime;

  const payload = {
    status: healthy ? "healthy" : "degraded",
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    latencyMs: totalDurationMs,
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

  return NextResponse.json(payload, { status: healthy ? 200 : 503 });
}
