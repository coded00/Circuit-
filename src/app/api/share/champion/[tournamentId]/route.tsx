/**
 * Circuit — the Tournament Champion win-graphic. Public/unauthenticated
 * on purpose: this is the actual `og:image` the champion's share page
 * points at, and it has to render for social crawlers and for whoever
 * the winner shares it with, not just the winner themselves.
 */

import { ImageResponse } from "next/og";
import { prisma } from "@/lib/db";
import { realGameImage, unsplashUrl, gameAccent, CINEMATIC_GAMING_IMAGE } from "@/lib/gameImagery";
import { gameTint } from "@/components/GameArtTile";
import { loadShareCardFonts, MARKER_FONT_NAME } from "@/lib/ogFonts";
import { ShareCard } from "@/lib/shareCard";

export const runtime = "nodejs";

type BracketStructure = {
  totalRounds: number;
  rounds: { round: number; slots: { position: number; winnerId: string | null }[] }[];
};

// "NGN", not "₦" — the Naira sign isn't in the Google Fonts "latin"
// subset `ogFonts.ts` loads, so Satori (no system-font fallback, unlike
// a real browser) renders it as a missing-glyph box. Everywhere else in
// the app keeps the real ₦ symbol; this formatter is only for the
// Satori-rendered card.
function formatNaira(kobo: number): string {
  return `NGN ${(kobo / 100).toLocaleString("en-NG")}`;
}

export async function GET(_request: Request, { params }: { params: Promise<{ tournamentId: string }> }) {
  const { tournamentId } = await params;

  const [tournament, bracket] = await Promise.all([
    prisma.tournament.findUnique({
      where: { id: tournamentId },
      select: { name: true, game: true, prizeAmount: true, prizeText: true, posterUrl: true },
    }),
    prisma.bracket.findUnique({ where: { tournamentId } }),
  ]);
  if (!tournament || !bracket) return new Response("Not found", { status: 404 });

  const structure = bracket.structure as unknown as BracketStructure;
  const championId = structure.rounds[structure.totalRounds - 1]?.slots[0]?.winnerId ?? null;
  if (!championId) return new Response("No champion yet", { status: 404 });

  const champion = await prisma.user.findUnique({
    where: { id: championId },
    select: { displayName: true, handle: true, avatarUrl: true },
  });
  if (!champion) return new Response("Not found", { status: 404 });

  // Always a real photo — the tournament's own poster, a known game's
  // verified photo, or the generic cinematic-setup fallback — never a
  // flat gradient with nothing behind it.
  const backgroundImage = tournament.posterUrl ?? unsplashUrl(realGameImage(tournament.game) ?? CINEMATIC_GAMING_IMAGE, 1080);
  const fonts = await loadShareCardFonts();

  return new ImageResponse(
    (
      <ShareCard
        awardLabel="Champion"
        badgeKind="champion"
        displayName={champion.displayName}
        handle={champion.handle}
        avatarUrl={champion.avatarUrl}
        statLine={tournament.prizeAmount ? `${formatNaira(tournament.prizeAmount)} prize` : (tournament.prizeText ?? "Tournament Champion")}
        game={tournament.game}
        backgroundImage={backgroundImage}
        backgroundTint={gameTint(tournament.game)}
        accentColor={gameAccent(tournament.game, gameTint)}
        markerFontLoaded={fonts.some((f) => f.name === MARKER_FONT_NAME)}
      />
    ),
    { width: 1080, height: 1080, fonts }
  );
}
