/**
 * Circuit — a registered player adds, changes or removes their own stream for a tournament that takes player streams.
 * Sending an empty address removes it.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser, suspendedResponse } from "@/lib/session";
import { limitOrRespond } from "@/lib/rateLimitHttp";
import { modeAllowsPlayerStreams, parseStream } from "@/lib/streams";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  const suspended = suspendedResponse(user);
  if (suspended) return suspended;
  const tooMany = await limitOrRespond(`my-stream:${user.id}`, { max: 20, windowMs: 60 * 60 * 1000 }, "You've changed your stream a lot. Try again later.");
  if (tooMany) return tooMany;

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const tournament = await prisma.tournament.findUnique({ where: { id }, select: { streamMode: true, status: true } });
  if (!tournament) return NextResponse.json({ error: "Tournament not found." }, { status: 404 });
  if (!modeAllowsPlayerStreams(tournament.streamMode)) return NextResponse.json({ error: "This tournament doesn't take player streams." }, { status: 400 });
  if (tournament.status === "CANCELLED" || tournament.status === "COMPLETE") return NextResponse.json({ error: "This tournament has finished." }, { status: 409 });

  const registration = await prisma.registration.findUnique({ where: { tournamentId_userId: { tournamentId: id, userId: user.id } }, select: { id: true, status: true } });
  if (!registration || (registration.status !== "CONFIRMED" && registration.status !== "PENDING_PAYMENT")) {
    return NextResponse.json({ error: "You're not registered for this tournament." }, { status: 403 });
  }

  const parsed = parseStream({ platform: body?.platform, platformName: body?.platformName, url: body?.url });
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  await prisma.registration.update({
    where: { id: registration.id },
    data: parsed.stream
      ? { streamPlatform: parsed.stream.platform, streamPlatformName: parsed.stream.platformName, streamUrl: parsed.stream.url }
      : { streamPlatform: null, streamPlatformName: null, streamUrl: null },
  });
  return NextResponse.json({ ok: true, stream: parsed.stream });
}
