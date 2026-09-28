/**
 * Circuit — admin tournament edit, native to the admin shell. Reuses the
 * exact same `EditForm` the organizer-facing `/tournaments/[id]/edit`
 * renders (its fields/validation/PATCH call are identical regardless of
 * who's editing — that route's own auth gate already accepts staff) —
 * just hosted on an admin-native page instead of sending the admin out
 * to the player app's chrome to do it.
 */

import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { PageHeader, Panel } from "@/components/admin/ui";
import { loadOrganizerCatalog } from "@/lib/competitionConfig";
import EditForm from "@/app/tournaments/[id]/edit/EditForm";

export default async function AdminCompetitionEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const tournament = await prisma.tournament.findUnique({ where: { id } });
  if (!tournament) notFound();

  const hasPaidRegistration =
    tournament.entryFee > 0 &&
    (await prisma.registration.count({ where: { tournamentId: id, status: "CONFIRMED" } })) > 0;
  const [catalog, activeRegistrations, community] = await Promise.all([
    loadOrganizerCatalog(),
    prisma.registration.count({ where: { tournamentId: id, status: { in: ["PENDING_PAYMENT", "CONFIRMED"] } } }),
    prisma.community.findUnique({ where: { tournamentId: id }, select: { enabled: true } }),
  ]);

  return (
    <>
      <PageHeader
        back={{ href: `/admin/competitions/${id}`, label: tournament.name }}
        title="Edit competition"
        description={
          hasPaidRegistration
            ? "Players have paid — entry fee and prize are locked. Everything else can still change until registration closes."
            : "Changes apply immediately. The game and format lock once anyone registers."
        }
      />
      <Panel className="max-w-2xl">
        <EditForm
          tournament={tournament}
          moneyFieldsLocked={hasPaidRegistration}
          redirectTo={`/admin/competitions/${id}`}
          catalog={catalog}
          competitionLocked={activeRegistrations > 0}
          communityEnabled={community?.enabled ?? false}
        />
      </Panel>
    </>
  );
}
