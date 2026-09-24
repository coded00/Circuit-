/**
 * Circuit — the Top Fragger share page. Public/no-login-required, same
 * reasoning as the champion share page — see its own header comment.
 */

import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { buildMetadata, absoluteUrl } from "@/lib/seo";
import { ShareCardPageBody } from "@/components/ShareCardPageBody";
import { computeTopFragger } from "@/lib/awards";

async function loadTopFragger(tournamentId: string) {
  const [tournament, topFragger] = await Promise.all([
    prisma.tournament.findUnique({ where: { id: tournamentId }, select: { name: true, game: true } }),
    computeTopFragger(tournamentId),
  ]);
  if (!tournament || !topFragger) return null;

  const player = await prisma.user.findUnique({ where: { id: topFragger.userId }, select: { displayName: true, handle: true } });
  if (!player) return null;

  return { tournament, player, totalKills: topFragger.totalKills };
}

export async function generateMetadata({ params }: { params: Promise<{ tournamentId: string }> }): Promise<Metadata> {
  const { tournamentId } = await params;
  const data = await loadTopFragger(tournamentId);
  if (!data) return buildMetadata({ title: "Top Fragger", description: "", path: `/share/kills/${tournamentId}`, noindex: true });

  return buildMetadata({
    title: `${data.player.displayName} is Top Fragger in ${data.tournament.name}`,
    description: `${data.player.displayName} racked up ${data.totalKills} kills in ${data.tournament.name} on Circuit.`,
    path: `/share/kills/${tournamentId}`,
    image: absoluteUrl(`/api/share/kills/${tournamentId}`),
  });
}

export default async function TopFraggerSharePage({ params }: { params: Promise<{ tournamentId: string }> }) {
  const { tournamentId } = await params;
  const data = await loadTopFragger(tournamentId);
  if (!data) notFound();

  return (
    <ShareCardPageBody
      imageUrl={`/api/share/kills/${tournamentId}`}
      pageUrl={absoluteUrl(`/share/kills/${tournamentId}`)}
      shareTitle={`${data.player.displayName} is Top Fragger in ${data.tournament.name} on Circuit`}
      heading={`${data.player.displayName} is Top Fragger 🎯`}
      subheading={`${data.totalKills} kills · ${data.tournament.name}`}
      backHref={`/tournaments/${tournamentId}/bracket`}
    />
  );
}
