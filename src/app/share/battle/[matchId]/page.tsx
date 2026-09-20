/**
 * Circuit — the wager-Battle win share page. Public/no-login-required,
 * same reasoning as the champion share page — see its own header comment.
 */

import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { buildMetadata, absoluteUrl } from "@/lib/seo";
import { ShareCardPageBody } from "@/components/ShareCardPageBody";
import { isWagerBattleWin } from "@/lib/awards";

function formatNaira(kobo: number): string {
  return `₦${(kobo / 100).toLocaleString("en-NG")}`;
}

async function loadBattleWin(matchId: string) {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: {
      playerA: { select: { id: true, displayName: true } },
      playerB: { select: { id: true, displayName: true } },
      battle: { select: { game: true, stakeAmount: true } },
    },
  });
  if (!match || !isWagerBattleWin(match)) return null;

  const winner = match.winnerId === match.playerA.id ? match.playerA : match.playerB;
  const opponent = match.winnerId === match.playerA.id ? match.playerB : match.playerA;
  return { winner, opponent, game: match.battle!.game, pot: match.battle!.stakeAmount * 2 };
}

export async function generateMetadata({ params }: { params: Promise<{ matchId: string }> }): Promise<Metadata> {
  const { matchId } = await params;
  const data = await loadBattleWin(matchId);
  if (!data) return buildMetadata({ title: "Match Winner", description: "", path: `/share/battle/${matchId}`, noindex: true });

  return buildMetadata({
    title: `${data.winner.displayName} won ${formatNaira(data.pot)} on Circuit`,
    description: `${data.winner.displayName} beat ${data.opponent.displayName} in a ${data.game} Challenge on Circuit.`,
    path: `/share/battle/${matchId}`,
    image: absoluteUrl(`/api/share/battle/${matchId}`),
  });
}

export default async function BattleWinSharePage({ params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await params;
  const data = await loadBattleWin(matchId);
  if (!data) notFound();

  return (
    <ShareCardPageBody
      imageUrl={`/api/share/battle/${matchId}`}
      pageUrl={absoluteUrl(`/share/battle/${matchId}`)}
      shareTitle={`${data.winner.displayName} won ${formatNaira(data.pot)} on Circuit`}
      heading={`${data.winner.displayName} won the Challenge 🏆`}
      subheading={`Beat ${data.opponent.displayName} · ${formatNaira(data.pot)} won`}
      backHref={`/matches/${matchId}`}
    />
  );
}
