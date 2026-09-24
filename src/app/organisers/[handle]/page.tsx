/**
 * Circuit — public organiser profile (SEO brief section 3: "Where
 * appropriate, create public organiser profiles"). Genuinely new content,
 * not a duplicate of /players/[handle] — that page is about someone's own
 * competitive record (matches, rank); this one is about their track record
 * running tournaments for other people, which /players/[handle] currently
 * shows nothing about at all.
 *
 * 404s (not a thin/empty page) for a handle that isn't a real user, or is
 * a real user who has never actually organized a real tournament — an
 * `OrganizerProfile` row with zero real tournaments isn't public-page-
 * worthy content.
 */

import { cache } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Trophy, ShieldCheck, Users, Calendar } from "lucide-react";
import { prisma } from "@/lib/db";
import { buildMetadata, tournamentPath, absoluteUrl, organiserPath } from "@/lib/seo";
import { StatusPill, tournamentStatusInfo } from "@/components/StatusPill";
import { GameArtTile } from "@/components/GameArtTile";

function formatShortDate(date: Date): string {
  return date.toLocaleDateString("en-NG", { dateStyle: "medium" });
}

// react's cache() dedupes this within a single request — generateMetadata
// and the page component below both call it, but it only hits the DB once.
const getOrganiser = cache(async (handle: string) => {
  const user = await prisma.user.findUnique({
    where: { handle },
    select: {
      handle: true,
      displayName: true,
      avatarUrl: true,
      organizerProfile: {
        select: {
          verified: true,
          tournaments: {
            orderBy: { startAt: "desc" },
            select: {
              id: true,
              name: true,
              game: true,
              status: true,
              startAt: true,
              prizeAmount: true,
              posterUrl: true,
              _count: { select: { registrations: { where: { status: "CONFIRMED" } } } },
            },
          },
        },
      },
    },
  });

  if (!user?.organizerProfile || user.organizerProfile.tournaments.length === 0) return null;

  const totalPlayersHosted = user.organizerProfile.tournaments.reduce((sum, t) => sum + t._count.registrations, 0);
  const totalPrizeAwarded = user.organizerProfile.tournaments
    .filter((t) => t.status === "COMPLETE")
    .reduce((sum, t) => sum + (t.prizeAmount ?? 0), 0);

  return {
    handle: user.handle,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    verified: user.organizerProfile.verified,
    tournaments: user.organizerProfile.tournaments,
    totalPlayersHosted,
    totalPrizeAwarded,
  };
});

export async function generateMetadata({ params }: { params: Promise<{ handle: string }> }): Promise<Metadata> {
  const { handle } = await params;
  const organiser = await getOrganiser(handle);
  if (!organiser) return buildMetadata({ title: "Organiser not found", description: "", path: organiserPath(handle), noindex: true });

  return buildMetadata({
    title: `${organiser.displayName} — Tournament Organiser`,
    description: `${organiser.displayName} has organized ${organiser.tournaments.length} tournament${organiser.tournaments.length === 1 ? "" : "s"} on Circuit, hosting ${organiser.totalPlayersHosted} player${organiser.totalPlayersHosted === 1 ? "" : "s"}. Real Nigeria-first esports competitions.`,
    path: organiserPath(organiser.handle),
    // Uploaded avatars are site-relative (/api/images/...); structured data needs an absolute URL.
    image: organiser.avatarUrl ? (organiser.avatarUrl.startsWith("/") ? absoluteUrl(organiser.avatarUrl) : organiser.avatarUrl) : undefined,
  });
}

export default async function OrganiserPage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const organiser = await getOrganiser(handle);
  if (!organiser) notFound();

  const personJsonLd = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: organiser.displayName,
    url: absoluteUrl(organiserPath(organiser.handle)),
    // Uploaded avatars are site-relative (/api/images/...); structured data needs an absolute URL.
    image: organiser.avatarUrl ? (organiser.avatarUrl.startsWith("/") ? absoluteUrl(organiser.avatarUrl) : organiser.avatarUrl) : undefined,
  };

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-6 sm:p-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(personJsonLd) }} />

      <div className="card flex flex-col items-center gap-3 py-8 text-center sm:flex-row sm:items-center sm:gap-5 sm:py-6 sm:text-left">
        {organiser.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- external, unpredictable-host avatar URL
          <img src={organiser.avatarUrl} alt="" className="h-16 w-16 shrink-0 rounded-full border-2 border-border object-cover" />
        ) : (
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-2 border-border bg-surface-elevated text-xl font-semibold text-muted">
            {organiser.displayName.slice(0, 1).toUpperCase()}
          </div>
        )}
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1.5">
            <h1 className="font-display text-2xl font-bold tracking-tight">{organiser.displayName}</h1>
            {organiser.verified && <ShieldCheck size={20} className="text-accent-blue" />}
          </div>
          <p className="text-sm text-muted">
            <Link href={`/players/${organiser.handle}`} className="hover:underline">
              @{organiser.handle}
            </Link>{" "}
            · Tournament Organiser on Circuit
          </p>
          <div className="flex flex-wrap justify-center gap-2 pt-1 sm:justify-start">
            <span className="badge badge-neutral">
              <Trophy size={12} />
              {organiser.tournaments.length} tournament{organiser.tournaments.length === 1 ? "" : "s"} organized
            </span>
            <span className="badge badge-neutral">
              <Users size={12} />
              {organiser.totalPlayersHosted} player{organiser.totalPlayersHosted === 1 ? "" : "s"} hosted
            </span>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-section-heading">Tournaments by {organiser.displayName}</h2>
        <div className="flex flex-col gap-2">
          {organiser.tournaments.map((t) => {
            const status = tournamentStatusInfo(t.status);
            return (
              <Link key={t.id} href={tournamentPath(t)} className="card-row flex items-center gap-3 p-3">
                <GameArtTile game={t.game} className="h-10 w-10 shrink-0 rounded-[8px]" hideLabel />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium">{t.name}</span>
                  <span className="text-metadata flex items-center gap-1 truncate">
                    <Calendar size={10} />
                    {formatShortDate(t.startAt)} · {t.game}
                  </span>
                </div>
                <StatusPill tone={status.tone} pulse={status.pulse}>
                  {status.label}
                </StatusPill>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
