/**
 * Circuit — Admin Calendar. Create/manage the Community and Game Release
 * events that show on the real player calendar (`/calendar`) — the two
 * categories that page's own tabs used to show disabled/"Soon" for lack
 * of any real backing data (see `CalendarEventCategory`'s schema
 * comment). Tournaments/Challenges aren't manageable here — they're
 * still derived entirely from real Tournament/Battle rows, so there's
 * nothing to "create."
 */

import { prisma } from "@/lib/db";
import { CalendarEventList } from "@/components/admin/CalendarEventList";

export default async function AdminCalendarPage() {
  const events = await prisma.calendarEvent.findMany({ orderBy: { date: "desc" }, take: 100 });

  return (
    <div className="flex flex-1 flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-bold tracking-tight">Calendar</h1>
        <p className="text-sm text-muted">Community and Game Release events on the player calendar.</p>
      </div>

      <div className="card flex flex-col gap-1">
        <CalendarEventList events={events.map((e) => ({ ...e, date: e.date.toISOString() }))} />
      </div>
    </div>
  );
}
