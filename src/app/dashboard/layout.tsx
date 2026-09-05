/**
 * Circuit — Organizer Dashboard shell (docs/circuit-ui-references.md:
 * Linear's sidebar + detail-panel app shell — called the strongest
 * reference for V1's most complex screen). Persistent sidebar
 * (Tournaments/Battles/Disputes/Payouts), main panel swaps per route.
 */

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { DashboardNav } from "./DashboardNav";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login?next=/dashboard");
  }

  const disputeCount = await prisma.dispute.count({
    where: {
      status: { in: ["OPEN", "ORGANIZER_REVIEW"] },
      match: { tournament: { organizerId: user.id } },
    },
  });

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col sm:flex-row" data-zone="dashboard">
      <aside className="hidden w-52 shrink-0 border-r border-border px-3 py-8 sm:block">
        <DashboardNav disputeCount={disputeCount} orientation="vertical" />
      </aside>
      <div className="border-b border-border px-4 py-2 sm:hidden">
        <DashboardNav disputeCount={disputeCount} orientation="horizontal" />
      </div>
      <main className="min-w-0 flex-1 px-6 py-8">{children}</main>
    </div>
  );
}
