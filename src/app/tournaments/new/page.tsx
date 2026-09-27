import { redirect } from "next/navigation";
import { loginPath } from "@/lib/safeRedirect";
import { getCurrentUser } from "@/lib/session";
import { hostableCommunities } from "@/lib/communityDirectory";
import { loadOrganizerCatalog } from "@/lib/competitionConfig";
import TournamentForm from "./TournamentForm";

export default async function NewTournamentPage({ searchParams }: { searchParams: Promise<{ community?: string }> }) {
  const { community } = await searchParams;
  const user = await getCurrentUser();
  if (!user) {
    redirect(loginPath("/tournaments/new"));
  }
  const [catalog, hostCommunities] = await Promise.all([loadOrganizerCatalog(), hostableCommunities(user)]);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6 sm:px-8 sm:py-10">
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">Create a tournament</h1>
        <p className="text-sm text-muted">
          One form, live in seconds — you&apos;ll get a shareable link before registration even opens.
        </p>
      </div>
      <div className="card">
        <TournamentForm catalog={catalog} hostCommunities={hostCommunities} defaultHostCommunityId={community} />
      </div>
    </div>
  );
}
