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

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const result = await runScheduledSweep();
  return NextResponse.json(result);
}
