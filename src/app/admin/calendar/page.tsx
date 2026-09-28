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
import { PageHeader, Panel } from "@/components/admin/ui";

export default async function AdminCalendarPage() {
  const events = await prisma.calendarEvent.findMany({ orderBy: { date: "desc" }, take: 100 });

  return (
    <>
      <PageHeader title="Calendar" description="Community events and game releases on the player calendar. Tournaments and challenges appear there automatically." />
      <Panel>
        <CalendarEventList events={events.map((e) => ({ ...e, date: e.date.toISOString() }))} />
      </Panel>
    </>
  );
}
