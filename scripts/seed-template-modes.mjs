// Circuit — give the four challenge-template games a playable mode + format each and publish them.
// Run with: node --env-file=.env scripts/seed-template-modes.mjs   (idempotent)
import { PrismaClient } from "@prisma/client";

const SETUP = {
  "PUBG Mobile": [{ name: "Battle Royale", style: "LOBBY", format: { name: "Solo", playersPerTeam: 1, maxPlayersPerMatch: 100, structures: ["LOBBY_POINTS"] } }],
  "Free Fire": [{ name: "Battle Royale", style: "LOBBY", format: { name: "Solo", playersPerTeam: 1, maxPlayersPerMatch: 50, structures: ["LOBBY_POINTS"] } }],
  eFootball: [{ name: "1v1", style: "HEAD_TO_HEAD", format: { name: "1v1", playersPerTeam: 1, teamsPerMatch: 2, maxPlayersPerMatch: 2, structures: ["KNOCKOUT"] } }],
  "Mobile Legends": [{ name: "Classic 5v5", style: "HEAD_TO_HEAD", format: { name: "5v5", entryType: "TEAM", playersPerTeam: 5, minRoster: 5, maxRoster: 7, teamsPerMatch: 2, maxPlayersPerMatch: 10, structures: ["KNOCKOUT"] } }],
};

const prisma = new PrismaClient();
for (const [name, modes] of Object.entries(SETUP)) {
  const game = await prisma.game.findUnique({ where: { name } });
  if (!game) { console.log(`${name}: not in catalog, skipped`); continue; }
  for (const m of modes) {
    const mode = await prisma.gameMode.upsert({
      where: { gameId_name: { gameId: game.id, name: m.name } },
      update: {},
      create: { gameId: game.id, name: m.name, style: m.style, usesFormats: true },
    });
    await prisma.gameFormat.upsert({ where: { modeId_name: { modeId: mode.id, name: m.format.name } }, update: {}, create: { modeId: mode.id, ...m.format } });
  }
  await prisma.game.update({ where: { id: game.id }, data: { publishedAt: game.publishedAt ?? new Date() } });
  console.log(`${name}: mode + format ready, published`);
}
await prisma.$disconnect();
