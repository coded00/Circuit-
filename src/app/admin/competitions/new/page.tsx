/**
 * Circuit — admin tournament creation, native to the admin shell. Same
 * `TournamentForm` the player-facing `/tournaments/new` uses (identical
 * fields/validation/POST), just redirected back into the control center
 * on success instead of out to the public tournament page.
 */

import { loadOrganizerCatalog } from "@/lib/competitionConfig";
import TournamentForm from "@/app/tournaments/new/TournamentForm";
import { PageHeader, Panel } from "@/components/admin/ui";

export default async function AdminNewCompetitionPage() {
  const catalog = await loadOrganizerCatalog();

  return (
    <>
      <PageHeader back={{ href: "/admin/competitions", label: "Competitions" }} title="New competition" description="Created under your account as organizer. Pick the game, format and dates; players can register as soon as registration opens." />
      <Panel className="max-w-2xl">
        <TournamentForm redirectBase="/admin/competitions" catalog={catalog} />
      </Panel>
    </>
  );
}
