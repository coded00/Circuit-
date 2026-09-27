import { notFound, redirect } from "next/navigation";
import { loginPath } from "@/lib/safeRedirect";
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
    redirect(loginPath(`/tournaments/${id}/edit`));
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
  const [games, community] = await Promise.all([
    prisma.game.findMany({ where: { enabled: true, publishedAt: { not: null } }, orderBy: { name: "asc" } }),
    prisma.community.findUnique({ where: { tournamentId: id }, select: { enabled: true } }),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6 sm:px-8 sm:py-10">
      <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">Edit {tournament.name}</h1>
      <div className="card">
        <EditForm
          tournament={tournament}
          moneyFieldsLocked={hasPaidRegistration}
          games={games}
          communityEnabled={community?.enabled ?? false}
        />
      </div>
    </div>
  );
}
