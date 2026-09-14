import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import EditForm from "./EditForm";

export default async function EditTournamentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) {
    redirect(`/login?next=${encodeURIComponent(`/tournaments/${id}/edit`)}`);
  }

  const tournament = await prisma.tournament.findUnique({ where: { id } });
  if (!tournament) notFound();
  if (tournament.organizerId !== user.id && !user.isStaff) {
    redirect(`/tournaments/${id}`);
  }
  if (new Date() >= tournament.registrationCloseAt) {
    redirect(`/tournaments/${id}`);
  }

  const hasPaidRegistration =
    tournament.entryFee > 0 &&
    (await prisma.registration.count({ where: { tournamentId: id, status: "CONFIRMED" } })) > 0;
  const games = await prisma.game.findMany({ where: { enabled: true }, orderBy: { name: "asc" } });

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6 sm:p-8">
      <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">Edit {tournament.name}</h1>
      <div className="card">
        <EditForm tournament={tournament} moneyFieldsLocked={hasPaidRegistration} games={games} />
      </div>
    </div>
  );
}
