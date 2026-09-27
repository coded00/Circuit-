import { redirect } from "next/navigation";
import { loginPath } from "@/lib/safeRedirect";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { hostableCommunities } from "@/lib/communityDirectory";
import TournamentForm from "./TournamentForm";

export default async function NewTournamentPage({ searchParams }: { searchParams: Promise<{ community?: string }> }) {
  const { community } = await searchParams;
  const user = await getCurrentUser();
  if (!user) {
    redirect(loginPath("/tournaments/new"));
  }
  const [games, hostCommunities] = await Promise.all([
    prisma.game.findMany({ where: { enabled: true, publishedAt: { not: null } }, orderBy: { name: "asc" } }),
    hostableCommunities(user),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6 sm:px-8 sm:py-10">
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">Create a tournament</h1>
        <p className="text-sm text-muted">
          One form, live in seconds — you&apos;ll get a shareable link before registration even opens.
        </p>
      </div>
      <div className="card">
        <TournamentForm games={games} hostCommunities={hostCommunities} defaultHostCommunityId={community} />
      </div>
    </div>
  );
}
