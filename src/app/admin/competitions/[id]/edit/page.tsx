/**
 * Circuit — admin tournament edit, native to the admin shell. Reuses the
 * exact same `EditForm` the organizer-facing `/tournaments/[id]/edit`
 * renders (its fields/validation/PATCH call are identical regardless of
 * who's editing — that route's own auth gate already accepts staff) —
 * just hosted on an admin-native page instead of sending the admin out
 * to the player app's chrome to do it.
 */

import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import EditForm from "@/app/tournaments/[id]/edit/EditForm";

export default async function AdminCompetitionEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const tournament = await prisma.tournament.findUnique({ where: { id } });
  if (!tournament) notFound();

  const hasPaidRegistration =
    tournament.entryFee > 0 &&
    (await prisma.registration.count({ where: { tournamentId: id, status: "CONFIRMED" } })) > 0;

  return (
    <div className="flex flex-1 flex-col gap-6">
      <Link href={`/admin/competitions/${id}`} className="w-fit text-sm font-medium text-muted transition hover:text-foreground">
        ← Back
      </Link>
      <h1 className="font-display text-2xl font-bold tracking-tight">Edit {tournament.name}</h1>
      <div className="card max-w-2xl">
        <EditForm tournament={tournament} moneyFieldsLocked={hasPaidRegistration} redirectTo={`/admin/competitions/${id}`} />
      </div>
    </div>
  );
}
