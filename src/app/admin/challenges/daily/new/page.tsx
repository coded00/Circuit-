/** Circuit — Admin: new Daily Challenge draft. */

import { prisma } from "@/lib/db";
import { loadChallengeSettings } from "@/lib/dailyChallengeSettings";
import { PageHeader, Panel } from "@/components/admin/ui";
import { DailyChallengeForm } from "@/components/admin/DailyChallengeForm";

export default async function NewDailyChallengePage() {
  const [settings, games] = await Promise.all([
    loadChallengeSettings(),
    prisma.game.findMany({
      where: { enabled: true, publishedAt: { not: null } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, modes: { where: { enabled: true }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true } } },
    }),
  ]);

  return (
    <>
      <PageHeader title="New daily challenge" back={{ href: "/admin/challenges?kind=daily", label: "Challenges" }} description="Saved as a draft. Nothing is visible to players until you publish it." />
      {games.length === 0 ? (
        <Panel>
          <p className="text-[13px] text-muted">There are no published games yet. Publish one in Admin → Games first.</p>
        </Panel>
      ) : (
        <Panel>
          <DailyChallengeForm
            games={games}
            platformFeeBps={settings.platformFeeBps}
            maxEntryFeeKobo={settings.maxEntryFeeKobo}
            maxEntrants={settings.maxEntrants}
            maxPayoutBps={settings.maxPayoutBps}
          />
        </Panel>
      )}
    </>
  );
}
