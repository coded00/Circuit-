/**
 * Circuit — the Champion share page. Public/no-login-required, same as
 * the match page (BRK-2 precedent) — this is the actual link a champion
 * posts to social, so anyone who clicks it (Circuit account or not) has
 * to be able to see it.
 */

import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { loadChampion } from "@/lib/champion";
import { buildMetadata, absoluteUrl } from "@/lib/seo";
import { ShareCardPageBody } from "@/components/ShareCardPageBody";

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
