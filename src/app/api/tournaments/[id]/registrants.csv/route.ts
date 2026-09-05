/**
 * Circuit — registrant CSV export (Build Plan P5-5, maps: ORG-5).
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

function csvEscape(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  }

  const { id } = await params;
  const tournament = await prisma.tournament.findUnique({ where: { id } });
  if (!tournament) {
    return NextResponse.json({ error: "Tournament not found." }, { status: 404 });
  }
  if (tournament.organizerId !== user.id) {
    return NextResponse.json({ error: "Only the organizer can export this list." }, { status: 403 });
  }

  const registrations = await prisma.registration.findMany({
    where: { tournamentId: id },
    orderBy: { createdAt: "asc" },
    include: { user: { select: { displayName: true } } },
  });

  const rows = [
    ["Display name", "In-game ID", "Registration status"],
    ...registrations.map((r) => [r.user.displayName, r.inGameId, r.status]),
  ];
  const csv = rows.map((row) => row.map(csvEscape).join(",")).join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${tournament.name.replace(/[^a-z0-9]/gi, "_")}-registrants.csv"`,
    },
  });
}
