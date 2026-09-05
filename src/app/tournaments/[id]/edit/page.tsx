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
  if (tournament.organizerId !== user.id) {
    redirect(`/tournaments/${id}`);
  }
  if (new Date() >= tournament.registrationCloseAt) {
    redirect(`/tournaments/${id}`);
  }

  const hasPaidRegistration =
    tournament.entryFee > 0 &&
    (await prisma.registration.count({ where: { tournamentId: id, status: "CONFIRMED" } })) > 0;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-16">
      <h1 className="text-2xl font-semibold">Edit {tournament.name}</h1>
      <div className="card">
        <EditForm tournament={tournament} moneyFieldsLocked={hasPaidRegistration} />
      </div>
    </div>
  );
}
