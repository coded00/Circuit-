// Circuit Community — one-off backfill: join every account that existed
// before the platform-wide "Circuit" community shipped. New signups
// join automatically (see src/app/api/auth/signup/route.ts); this
// script covers everyone who signed up before that existed.
//
// Usage: node scripts/backfill-global-community.mjs
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// This dev environment's DB has shown flaky connection-pool timeouts
// specifically on a fresh process's first query, reliably recovering by
// the 2nd or 3rd attempt — a plain retry-with-backoff absorbs it.
async function withRetry(fn, attempts = 5) {
  let lastError;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      console.error(`attempt ${i + 1} failed: ${err.message.split("\n")[0]}`);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  throw lastError;
}

const DEFAULT_CHANNELS = [
  { key: "general", name: "general" },
  { key: "announcements", name: "announcements" },
  { key: "matches", name: "matches" },
  { key: "results", name: "results" },
];

async function getOrCreateGlobalCommunity() {
  const existing = await prisma.community.findFirst({ where: { isGlobal: true } });
  if (existing) return existing;

  return prisma.$transaction(async (tx) => {
    const again = await tx.community.findFirst({ where: { isGlobal: true } });
    if (again) return again;

    const community = await tx.community.create({ data: { isGlobal: true, enabled: true } });
    await tx.channel.createMany({
      data: DEFAULT_CHANNELS.map((c) => ({ communityId: community.id, key: c.key, name: c.name })),
    });
    return community;
  });
}

async function main() {
  const community = await withRetry(() => getOrCreateGlobalCommunity());
  console.log(`Global community: ${community.id}`);

  const users = await withRetry(() => prisma.user.findMany({ select: { id: true } }));
  // One bulk insert, not a per-user round trip — this session's test data
  // alone is 100+ accounts, and a sequential loop that size kept losing
  // the race against the connection pool's own 10s timeout.
  const result = await withRetry(() =>
    prisma.communityMember.createMany({
      data: users.map((u) => ({ communityId: community.id, userId: u.id })),
      skipDuplicates: true,
    })
  );
  console.log(`Backfilled ${result.count} of ${users.length} accounts into the Circuit community.`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
