/**
 * Circuit — Tournament & Challenge Transactions CSV export, honoring the
 * same eq/etype/estatus filters as the Admin Finance page's Escrow
 * Transactions tab — same csvEscape pattern as
 * tournaments/[id]/registrants.csv/route.ts.
 */

import { NextResponse } from "next/server";
import type { EscrowStatus, EscrowType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireStaff } from "@/lib/session";

function csvEscape(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function escrowTypeLabel(type: EscrowType): string {
  switch (type) {
    case "ENTRY_FEE":
      return "Entry fee";
    case "REFUND":
      return "Refund";
    case "PRIZE_PAYOUT":
      return "Prize payout";
    case "STAKE":
      return "Challenge stake";
    case "STAKE_PAYOUT":
      return "Challenge stake payout";
    case "PLATFORM_FEE":
      return "Platform fee";
    case "ORGANIZER_REVENUE":
      return "Organizer revenue";
  }
}

export async function GET(request: Request) {
  const staffAuth = await requireStaff();
  if (staffAuth.error) return staffAuth.error;

  const { searchParams } = new URL(request.url);
  const eq = searchParams.get("eq")?.trim() ?? "";
  const etype = searchParams.get("etype") ?? "";
  const estatus = searchParams.get("estatus") ?? "";

  const and: Prisma.EscrowTransactionWhereInput[] = [];
  if (eq) {
    and.push({
      OR: [
        { tournament: { name: { contains: eq, mode: "insensitive" } } },
        { battle: { game: { contains: eq, mode: "insensitive" } } },
        { user: { OR: [{ displayName: { contains: eq, mode: "insensitive" } }, { handle: { contains: eq, mode: "insensitive" } }] } },
        { registration: { user: { OR: [{ displayName: { contains: eq, mode: "insensitive" } }, { handle: { contains: eq, mode: "insensitive" } }] } } },
      ],
    });
  }
  if (etype) and.push({ type: etype as EscrowType });
  if (estatus) and.push({ status: estatus as EscrowStatus });

  const transactions = await prisma.escrowTransaction.findMany({
    where: and.length ? { AND: and } : {},
    orderBy: { createdAt: "desc" },
    take: 5000,
    include: {
      tournament: { select: { name: true } },
      battle: { select: { game: true } },
      user: { select: { displayName: true, handle: true } },
      registration: { include: { user: { select: { displayName: true, handle: true } } } },
    },
  });

  const rows = [
    ["Transaction ID", "Tournament / Challenge", "Player", "Handle", "Type", "Amount (kobo)", "Provider", "Provider ref", "Status", "Created"],
    ...transactions.map((t) => {
      const player = t.registration?.user ?? t.user ?? null;
      return [
        t.id,
        t.tournament?.name ?? (t.battle ? `${t.battle.game} challenge` : ""),
        player?.displayName ?? "",
        player?.handle ?? "",
        escrowTypeLabel(t.type),
        String(t.amount),
        t.provider ?? "",
        t.providerRef ?? "",
        t.status,
        t.createdAt.toISOString(),
      ];
    }),
  ];
  const csv = rows.map((row) => row.map(csvEscape).join(",")).join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="circuit-tournament-challenge-transactions.csv"`,
    },
  });
}
