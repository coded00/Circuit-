/**
 * Circuit — full notification inbox. The bell (src/components/
 * NotificationBell.tsx) is a shallow 5-item preview; this is the
 * paginated, everything-you've-missed surface it links to — same
 * shallow-indicator-links-to-full-page shape as DashboardNav's dispute
 * badge linking to /dashboard/disputes.
 */

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { formatNotification } from "@/lib/notification-format";
import MarkAllReadButton from "./MarkAllReadButton";
import LoadMoreNotifications from "./LoadMoreNotifications";

const PAGE_SIZE = 20;

const relativeTime = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
function formatRelative(date: Date): string {
  const diffMin = Math.round((date.getTime() - Date.now()) / 60000);
  if (Math.abs(diffMin) < 60) return relativeTime.format(diffMin, "minute");
  const diffHour = Math.round(diffMin / 60);
  if (Math.abs(diffHour) < 24) return relativeTime.format(diffHour, "hour");
  return relativeTime.format(Math.round(diffHour / 24), "day");
}

export default async function NotificationsPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login?next=/notifications");
  }

  const rows = await prisma.notification.findMany({
    where: { userId: user.id },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: PAGE_SIZE + 1,
  });
  const hasMore = rows.length > PAGE_SIZE;
  const page = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
  const nextCursor = hasMore ? page[page.length - 1].id : null;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-6 sm:p-8">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-section-heading text-xl">Notifications</h1>
        <MarkAllReadButton />
      </div>

      {page.length === 0 ? (
        <p className="card text-center text-muted">You don&apos;t have any notifications yet.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {page.map((n) => {
            const { message, href } = formatNotification(n.type, n.payload);
            return (
              <a key={n.id} href={href} className="card-row flex items-start gap-3 p-3">
                {!n.readAt && <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-blue" aria-hidden />}
                <span className="flex flex-1 flex-col gap-0.5">
                  <span className={n.readAt ? "text-sm text-muted" : "text-sm"}>{message}</span>
                  <span className="text-metadata">{formatRelative(n.createdAt)}</span>
                </span>
              </a>
            );
          })}
        </div>
      )}

      <LoadMoreNotifications initialCursor={nextCursor} />
    </div>
  );
}
