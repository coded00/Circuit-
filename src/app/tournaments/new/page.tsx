import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import TournamentForm from "./TournamentForm";

export default async function NewTournamentPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login?next=/tournaments/new");
  }
  const games = await prisma.game.findMany({ where: { enabled: true }, orderBy: { name: "asc" } });

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6 sm:p-8">
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">Create a tournament</h1>
        <p className="text-sm text-muted">
          One form, live in seconds — you&apos;ll get a shareable link before registration even opens.
        </p>
      </div>
      <div className="card">
        <TournamentForm games={games} />
      </div>
    </div>
  );
}
