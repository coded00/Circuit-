/**
 * Circuit — admin tournament creation, native to the admin shell. Same
 * `TournamentForm` the player-facing `/tournaments/new` uses (identical
 * fields/validation/POST), just redirected back into the control center
 * on success instead of out to the public tournament page.
 */

import Link from "next/link";
import { prisma } from "@/lib/db";
import TournamentForm from "@/app/tournaments/new/TournamentForm";

export default async function AdminNewCompetitionPage() {
  const games = await prisma.game.findMany({ where: { enabled: true }, orderBy: { name: "asc" } });

  return (
    <div className="flex flex-1 flex-col gap-6">
      <Link href="/admin/competitions" className="w-fit text-sm font-medium text-muted transition hover:text-foreground">
        ← All competitions
      </Link>
      <h1 className="font-display text-2xl font-bold tracking-tight">Create a competition</h1>
      <div className="card max-w-2xl">
        <TournamentForm redirectTo={(id) => `/admin/competitions/${id}`} games={games} />
      </div>
    </div>
  );
}
