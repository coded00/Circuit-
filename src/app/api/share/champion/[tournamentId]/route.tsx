/**
 * Circuit — the Tournament Champion win-graphic. Public/unauthenticated
 * on purpose: this is the actual `og:image` the champion's share page
 * points at, and it has to render for social crawlers and for whoever
 * the winner shares it with, not just the winner themselves.
 */

import { ImageResponse } from "next/og";
import { resolveImageForOg } from "@/lib/uploads";
import { loadChampion } from "@/lib/champion";
import { realGameImage, unsplashUrl, gameAccent, CINEMATIC_GAMING_IMAGE } from "@/lib/gameImagery";
import { gameTint } from "@/lib/gameTint";
import { loadShareCardFonts, MARKER_FONT_NAME } from "@/lib/ogFonts";
import { ShareCard } from "@/lib/shareCard";

export const runtime = "nodejs";

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

  const data = await loadChampion(tournamentId);
  if (!data) return new Response("No champion yet", { status: 404 });
  const { tournament, champion } = data;

  // Always a real photo — the tournament's own poster, a known game's
  // verified photo, or the generic cinematic-setup fallback — never a
  // flat gradient with nothing behind it.
  const backgroundImage = (await resolveImageForOg(tournament.posterUrl)) ?? unsplashUrl(realGameImage(tournament.game) ?? CINEMATIC_GAMING_IMAGE, 1080);
  const fonts = await loadShareCardFonts();

  return new ImageResponse(
    (
      <ShareCard
        awardLabel="Champion"
        badgeKind="champion"
        displayName={champion.displayName}
        handle={champion.handle}
        avatarUrl={await resolveImageForOg(champion.avatarUrl)}
        statLine={tournament.prizeAmount ? `${formatNaira(tournament.prizeAmount)} prize` : (data.lobbyLine ?? tournament.prizeText ?? "Tournament Champion")}
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
