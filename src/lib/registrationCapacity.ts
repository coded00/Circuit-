/**
 * Circuit — the last open slot.
 *
 * "Count confirmed registrations, then confirm one more" isn't safe on its
 * own: two requests for the last slot can both count cap - 1 and both get
 * in. Every write that confirms a registration first locks the
 * tournament's row (SELECT … FOR UPDATE) inside its transaction, so those
 * writes take turns and each one's count sees the others'.
 */

import type { Prisma } from "@prisma/client";

export class RegistrationFullError extends Error {}

/** Holds the tournament's row lock until `tx` ends. */
export async function lockTournament(tx: Prisma.TransactionClient, tournamentId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "Tournament" WHERE id = ${tournamentId} FOR UPDATE`;
}

/** Locks the tournament and throws RegistrationFullError if every slot is already confirmed. */
export async function claimSlot(tx: Prisma.TransactionClient, tournamentId: string, participantCap: number): Promise<void> {
  await lockTournament(tx, tournamentId);
  const confirmed = await tx.registration.count({ where: { tournamentId, status: "CONFIRMED" } });
  if (confirmed >= participantCap) throw new RegistrationFullError();
}
