// One-off: bulk-create dummy users + CONFIRMED registrations for a
// tournament, for local demo/testing of bracket generation at scale.
// Deliberately bypasses the real signup/registration API (which would
// mean hundreds of real HTTP round-trips for something that's just seed
// data) — these accounts are never logged into. The LAST registrant
// needed to fill the cap should still go through the real UI/API so the
// actual production bracket-generation code path runs for real, not a
// reimplementation of it here.
//
// Usage: node scripts/bulk-register.mjs <tournamentId> <count>

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const [tournamentId, countArg] = process.argv.slice(2);
const count = Number(countArg);

async function main() {
  if (!tournamentId || !Number.isInteger(count) || count < 1) {
    console.error("Usage: node scripts/bulk-register.mjs <tournamentId> <count>");
    process.exit(1);
  }

  const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId } });
  if (!tournament) {
    console.error("No tournament with that id.");
    process.exit(1);
  }

  const stamp = Date.now().toString(36);
  let created = 0;

  for (let i = 1; i <= count; i++) {
    const handle = `bracket_${stamp}_${String(i).padStart(3, "0")}`;
    const user = await prisma.user.create({
      data: {
        displayName: `Bracket Test ${i}`,
        handle,
        emailOrPhone: `${handle}@bracket-test.circuit`,
      },
    });
    await prisma.registration.create({
      data: {
        tournamentId,
        userId: user.id,
        status: "CONFIRMED",
        inGameId: `${handle}_ign`,
      },
    });
    created += 1;
  }

  console.log(`Created ${created} confirmed registrations for tournament ${tournamentId}.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
