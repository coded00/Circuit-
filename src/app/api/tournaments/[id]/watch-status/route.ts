/** Circuit Watch: which channels are live, and with how many viewers. Public, cached, and rate-limited per address. */
import { NextResponse } from "next/server";
import { getClientIp } from "@/lib/rateLimit";
import { limitOrRespond } from "@/lib/rateLimitHttp";
import { loadChannelStatuses, loadWatchHub } from "@/lib/watchHub";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const limited = await limitOrRespond(
    `watch-status:${getClientIp(request)}`,
    { max: 30, windowMs: 60_000 },
    "Too many requests. Try again in a minute.",
  );
  if (limited) return limited;
  const hub = await loadWatchHub(id, "localhost");
  if (!hub) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(
    { statuses: await loadChannelStatuses(hub.channels) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
