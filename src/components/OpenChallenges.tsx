/**
 * Circuit — homepage "Open challenges": the newest few open Battles as the
 * same lobby rows as the /battles board (ChallengeRow), in one panel.
 */

import { Panel, PanelRows } from "@/components/ui/Panel";
import { ChallengeRow, type ChallengeRowData } from "@/components/ChallengeRow";
import Link from "next/link";

export function OpenChallenges({
  battles,
  viewerId,
}: {
  battles: (ChallengeRowData & { creatorId: string })[];
  viewerId?: string | null;
}) {
  if (battles.length === 0) return null;
  return (
    <Panel
      title="Open challenges"
      meta={battles.length}
      action={
        <Link href="/battles" className="text-xs font-medium text-accent-blue hover:underline">
          View all
        </Link>
      }
    >
      <PanelRows>
        {battles.map((b) => (
          <ChallengeRow key={b.id} battle={b} mine={viewerId === b.creatorId} />
        ))}
      </PanelRows>
    </Panel>
  );
}
