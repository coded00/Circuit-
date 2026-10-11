// Circuit — add the games the challenge templates run on to the catalog, UNPUBLISHED.
//
// Run with: node --env-file=.env scripts/seed-template-games.mjs
//
// Publishing a game is a visible product change (it appears in the tournament and Battle pickers and on the homepage
// Games row), so this only creates the entries; publish each one in Admin → Games when you are ready. A template can't be
// switched on until its game is published. Games that already exist are left exactly as they are.

import { PrismaClient } from "@prisma/client";

const GAMES = [
  { name: "PUBG Mobile", slug: "pubg-mobile", publisher: "Krafton / Tencent", category: "Battle Royale", platforms: ["Android", "iOS"] },
  { name: "Free Fire", slug: "free-fire", publisher: "Garena", category: "Battle Royale", platforms: ["Android", "iOS"] },
  { name: "eFootball", slug: "efootball", publisher: "Konami", category: "Sports", platforms: ["Android", "iOS", "PC", "Console"] },
  { name: "Mobile Legends", slug: "mobile-legends", publisher: "Moonton", category: "MOBA", platforms: ["Android", "iOS"] },
];

const prisma = new PrismaClient();
for (const g of GAMES) {
  const existing = await prisma.game.findFirst({ where: { OR: [{ name: { equals: g.name, mode: "insensitive" } }, { slug: g.slug }] } });
  if (existing) {
    console.log(`${g.name}: already in the catalog (${existing.publishedAt ? "published" : "unpublished"}) — left alone`);
    continue;
  }
  await prisma.game.create({ data: { ...g, enabled: true, publishedAt: null } });
  console.log(`${g.name}: added, unpublished`);
}
await prisma.$disconnect();
