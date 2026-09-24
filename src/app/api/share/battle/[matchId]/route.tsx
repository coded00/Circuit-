/**
 * Circuit — the wager-Battle win graphic. Public/unauthenticated, same
 * reasoning as the champion route — see that file's header comment.
 */

import { ImageResponse } from "next/og";
import { resolveImageForOg } from "@/lib/uploads";
import { prisma } from "@/lib/db";
import { realGameImage, unsplashUrl, gameAccent, CINEMATIC_GAMING_IMAGE } from "@/lib/gameImagery";
import { gameTint } from "@/components/GameArtTile";
import { loadShareCardFonts, MARKER_FONT_NAME } from "@/lib/ogFonts";
import { ShareCard } from "@/lib/shareCard";
import { isWagerBattleWin } from "@/lib/awards";

export const runtime = "nodejs";

// "NGN", not "₦" — see champion/[tournamentId]/route.tsx's own comment:
// the Naira sign isn't in the Google Fonts "latin" subset, and Satori has
// no system-font fallback the way a real browser does.
function formatNaira(kobo: number): string {
  return `NGN ${(kobo / 100).toLocaleString("en-NG")}`;
}

export async function GET(_request: Request, { params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await params;

  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: {
      playerA: { select: { id: true, displayName: true, handle: true, avatarUrl: true } },
      playerB: { select: { id: true, displayName: true, handle: true, avatarUrl: true } },
      battle: { select: { game: true, stakeAmount: true } },
    },
  });
  if (!match || !isWagerBattleWin(match)) return new Response("Not found", { status: 404 });

  const winner = match.winnerId === match.playerA.id ? match.playerA : match.playerB;
  const opponent = match.winnerId === match.playerA.id ? match.playerB : match.playerA;
  const game = match.battle!.game;
  const pot = match.battle!.stakeAmount * 2;

  const fonts = await loadShareCardFonts();

  return new ImageResponse(
    (
      <ShareCard
        awardLabel="Match Winner"
        badgeKind="battle"
        displayName={winner.displayName}
        handle={winner.handle}
        avatarUrl={await resolveImageForOg(winner.avatarUrl)}
        statLine={`Beat ${opponent.displayName} · ${formatNaira(pot)} won`}
        game={game}
        backgroundImage={unsplashUrl(realGameImage(game) ?? CINEMATIC_GAMING_IMAGE, 1080)}
        backgroundTint={gameTint(game)}
        accentColor={gameAccent(game, gameTint)}
        markerFontLoaded={fonts.some((f) => f.name === MARKER_FONT_NAME)}
      />
    ),
    { width: 1080, height: 1080, fonts }
  );
}
