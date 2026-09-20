/**
 * Circuit — the Top Fragger win graphic. Public/unauthenticated, same
 * reasoning as the champion route — see that file's header comment.
 */

import { ImageResponse } from "next/og";
import { prisma } from "@/lib/db";
import { realGameImage, unsplashUrl, gameAccent, CINEMATIC_GAMING_IMAGE } from "@/lib/gameImagery";
import { gameTint } from "@/components/GameArtTile";
import { loadShareCardFonts, MARKER_FONT_NAME } from "@/lib/ogFonts";
import { ShareCard } from "@/lib/shareCard";
import { computeTopFragger } from "@/lib/awards";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ tournamentId: string }> }) {
  const { tournamentId } = await params;

  const [tournament, topFragger] = await Promise.all([
    prisma.tournament.findUnique({ where: { id: tournamentId }, select: { name: true, game: true } }),
    computeTopFragger(tournamentId),
  ]);
  if (!tournament || !topFragger) return new Response("Not found", { status: 404 });

  const player = await prisma.user.findUnique({
    where: { id: topFragger.userId },
    select: { displayName: true, handle: true, avatarUrl: true },
  });
  if (!player) return new Response("Not found", { status: 404 });

  const fonts = await loadShareCardFonts();

  return new ImageResponse(
    (
      <ShareCard
        awardLabel="Top Fragger"
        badgeKind="kills"
        displayName={player.displayName}
        handle={player.handle}
        avatarUrl={player.avatarUrl}
        statLine={`${topFragger.totalKills} kills · ${tournament.name}`}
        game={tournament.game}
        backgroundImage={unsplashUrl(realGameImage(tournament.game) ?? CINEMATIC_GAMING_IMAGE, 1080)}
        backgroundTint={gameTint(tournament.game)}
        accentColor={gameAccent(tournament.game, gameTint)}
        markerFontLoaded={fonts.some((f) => f.name === MARKER_FONT_NAME)}
      />
    ),
    { width: 1080, height: 1080, fonts }
  );
}
