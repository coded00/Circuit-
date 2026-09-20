/**
 * Circuit — the Champion share page. Public/no-login-required, same as
 * the match page (BRK-2 precedent) — this is the actual link a champion
 * posts to social, so anyone who clicks it (Circuit account or not) has
 * to be able to see it.
 */

import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { buildMetadata, absoluteUrl } from "@/lib/seo";
import { ShareCardPageBody } from "@/components/ShareCardPageBody";

type BracketStructure = {
  totalRounds: number;
  rounds: { round: number; slots: { position: number; winnerId: string | null }[] }[];
};

async function loadChampion(tournamentId: string) {
  const [tournament, bracket] = await Promise.all([
    prisma.tournament.findUnique({ where: { id: tournamentId }, select: { id: true, name: true, game: true } }),
    prisma.bracket.findUnique({ where: { tournamentId } }),
  ]);
  if (!tournament || !bracket) return null;

  const structure = bracket.structure as unknown as BracketStructure;
  const championId = structure.rounds[structure.totalRounds - 1]?.slots[0]?.winnerId ?? null;
  if (!championId) return null;

  const champion = await prisma.user.findUnique({ where: { id: championId }, select: { displayName: true, handle: true } });
  if (!champion) return null;

  return { tournament, champion };
}

export async function generateMetadata({ params }: { params: Promise<{ tournamentId: string }> }): Promise<Metadata> {
  const { tournamentId } = await params;
  const data = await loadChampion(tournamentId);
  if (!data) return buildMetadata({ title: "Champion", description: "", path: `/share/champion/${tournamentId}`, noindex: true });

  return buildMetadata({
    title: `${data.champion.displayName} won ${data.tournament.name}`,
    description: `${data.champion.displayName} is the Circuit champion of ${data.tournament.name}.`,
    path: `/share/champion/${tournamentId}`,
    image: absoluteUrl(`/api/share/champion/${tournamentId}`),
  });
}

export default async function ChampionSharePage({ params }: { params: Promise<{ tournamentId: string }> }) {
  const { tournamentId } = await params;
  const data = await loadChampion(tournamentId);
  if (!data) notFound();

  return (
    <ShareCardPageBody
      imageUrl={`/api/share/champion/${tournamentId}`}
      pageUrl={absoluteUrl(`/share/champion/${tournamentId}`)}
      shareTitle={`${data.champion.displayName} won ${data.tournament.name} on Circuit`}
      heading={`${data.champion.displayName} is the champion 🏆`}
      subheading={data.tournament.name}
      backHref={`/tournaments/${tournamentId}/bracket`}
    />
  );
}
