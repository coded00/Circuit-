/**
 * Circuit — Quick Match detail page. Two very different viewers land
 * here: the host (from BattleForm's own redirect, sees the "Searching for
 * an opponent..." screen) and a recipient (from a QUICK_MATCH_CHALLENGE
 * notification link, sees the same accept/decline card the live modal
 * already shows them — this page is the fallback for whoever clicks the
 * notification instead of catching that modal).
 */

import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { QuickMatchSearchingScreen } from "@/components/QuickMatchSearchingScreen";
import { QuickMatchRecipientPageView } from "@/components/QuickMatchRecipientPageView";

export default async function QuickMatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) {
    redirect(`/login?next=/quick-match/${id}`);
  }

  const challenge = await prisma.quickMatchChallenge.findUnique({
    where: { id },
    include: { host: { select: { displayName: true, handle: true } } },
  });
  if (!challenge) {
    notFound();
  }

  if (challenge.hostId === user.id) {
    const [recipientCount, respondedCount] = await Promise.all([
      prisma.quickMatchRecipient.count({ where: { challengeId: id } }),
      prisma.quickMatchRecipient.count({ where: { challengeId: id, status: { not: "PENDING" } } }),
    ]);
    return (
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 p-6 sm:p-8">
        <QuickMatchSearchingScreen
          challengeId={id}
          initial={{
            id: challenge.id,
            status: challenge.status,
            game: challenge.game,
            format: challenge.format,
            stakeAmount: challenge.stakeAmount,
            expiresAt: challenge.expiresAt.toISOString(),
            battleId: challenge.battleId,
            recipientCount,
            respondedCount,
          }}
        />
      </div>
    );
  }

  const recipientRow = await prisma.quickMatchRecipient.findUnique({
    where: { challengeId_recipientUserId: { challengeId: id, recipientUserId: user.id } },
  });
  if (!recipientRow) {
    notFound();
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 p-6 sm:p-8">
      <QuickMatchRecipientPageView
        challenge={{
          id: challenge.id,
          game: challenge.game,
          format: challenge.format,
          stakeAmount: challenge.stakeAmount,
          expiresAt: challenge.expiresAt.toISOString(),
          hostDisplayName: challenge.host.displayName,
          hostHandle: challenge.host.handle,
        }}
        alreadyResolved={recipientRow.status !== "PENDING" || challenge.status !== "PENDING"}
      />
    </div>
  );
}
