import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import RegistrationForm from "./RegistrationForm";

export default async function RegisterPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) {
    redirect(`/login?next=${encodeURIComponent(`/tournaments/${id}/register`)}`);
  }

  const tournament = await prisma.tournament.findUnique({ where: { id } });
  if (!tournament) {
    notFound();
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-6 py-16">
      <h1 className="text-2xl font-semibold">Register for {tournament.name}</h1>
      <p className="text-sm text-muted">
        {tournament.entryFee === 0
          ? "This tournament is free to enter."
          : `Entry fee: ₦${(tournament.entryFee / 100).toLocaleString("en-NG")} — you'll be redirected to pay after submitting.`}
      </p>
      <RegistrationForm tournamentId={tournament.id} />
    </div>
  );
}
