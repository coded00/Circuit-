/** Circuit — Admin: edit a Daily Challenge draft. Published challenges are not editable. */

import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { isEditable } from "@/lib/dailyChallenges";
import { loadChallengeSettings } from "@/lib/dailyChallengeSettings";
import { PageHeader, Panel } from "@/components/admin/ui";
import { DailyChallengeForm } from "@/components/admin/DailyChallengeForm";

export default async function EditDailyChallengePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [c, settings, games] = await Promise.all([
    prisma.dailyChallenge.findUnique({ where: { id }, include: { requirements: { orderBy: { sortOrder: "asc" } }, prizeCategories: { orderBy: { sortOrder: "asc" } } } }),
    loadChallengeSettings(),
    prisma.game.findMany({
      where: { enabled: true, publishedAt: { not: null } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, modes: { where: { enabled: true }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true } } },
    }),
  ]);
  if (!c) notFound();
  if (!isEditable(c.status)) redirect(`/admin/challenges/daily/${id}`);

  return (
    <>
      <PageHeader title="Edit draft" back={{ href: `/admin/challenges/daily/${id}`, label: c.title }} />
      <Panel>
        <DailyChallengeForm
          games={games}
          platformFeeBps={settings.platformFeeBps}
          maxEntryFeeKobo={settings.maxEntryFeeKobo}
          maxEntrants={settings.maxEntrants}
          maxPayoutBps={settings.maxPayoutBps}
          challengeId={id}
          initial={{
            gameId: c.gameId,
            gameModeId: c.gameModeId,
            title: c.title,
            rules: c.rules,
            evidenceRequirements: c.evidenceRequirements,
            requireRecording: c.requireRecording,
            metricLabel: c.metricLabel,
            metricUnit: c.metricUnit,
            direction: c.direction,
            tiebreakLabel: c.tiebreakLabel,
            tiebreakDirection: c.tiebreakDirection,
            tiebreakRule: c.tiebreakRule,
            entryFee: c.entryFee,
            minEntrants: c.minEntrants,
            maxEntrants: c.maxEntrants,
            prizeSplit: c.prizeSplit,
            entryOpensAt: c.entryOpensAt.toISOString(),
            entryClosesAt: c.entryClosesAt.toISOString(),
            windowStartsAt: c.windowStartsAt.toISOString(),
            windowEndsAt: c.windowEndsAt.toISOString(),
            submissionsCloseAt: c.submissionsCloseAt.toISOString(),
            disputeWindowMinutes: c.disputeWindowMinutes,
            requirements: c.requirements.map((r) => ({ key: r.id, kind: r.kind, label: r.label, gate: r.gate, needsRecording: r.needsRecording, unit: r.unit ?? "", direction: r.direction ?? "HIGHER", threshold: r.threshold === null ? "" : String(r.threshold) })),
            kind: c.kind,
            weaponLabel: c.weaponLabel,
            scoreNeedsRecording: c.scoreNeedsRecording,
            minScore: c.minScore,
            noWinnerPolicy: c.noWinnerPolicy,
            prizeCategories: c.prizeCategories.map((p) => ({
              key: p.id,
              name: p.name,
              amount: String(p.amountKobo / 100),
              metricKey: p.metricRequirementId ?? "",
              place: String(p.place),
              requires: p.requiresRequirementIds,
              comboOf: p.comboOfCategoryIds,
            })),
          }}
        />
      </Panel>
    </>
  );
}
