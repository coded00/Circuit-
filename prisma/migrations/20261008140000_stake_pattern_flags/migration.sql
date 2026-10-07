-- Repeated-pair collusion detection: the queue, and the four numbers that
-- decide who lands in it.
--
-- This is the last of the three things finding #7 of the 2026-10-07 security
-- audit asks for, after the cumulative stake limits and the player's own
-- cool-off. docs/circuit-strategy.md §10 names it directly: "pattern detection
-- on repeated losses between the same two accounts". Without it, two accounts
-- can hand money back and forth through staked Battles with nothing on the
-- platform noticing, and the winner's withdrawals look like winnings.
--
-- A flag is not a verdict and moves no money. It puts a pair in front of a
-- person with the numbers that put them there. Nothing reads this table to
-- make an automated decision — the sweep writes it, /admin/stakes reads it,
-- and a staff member closes it.
--
-- The unique index is the load-bearing part. The sweep runs every two minutes
-- and re-measures every pair in the window on every run; without a constraint,
-- a pair that stays suspicious opens a new flag thirty times an hour and
-- buries the queue. Scoping uniqueness to status = 'OPEN' is what makes that
-- work while still allowing a pair to be flagged again later: dismissing a
-- flag frees the pair, so a pair that keeps going after being cleared opens a
-- fresh one, with a person's earlier judgement still on the closed row.
--
-- It has to be a partial index, and Prisma's schema language cannot express
-- the WHERE clause, so this one lives here and not as an @@unique in
-- schema.prisma — the same reason a CHECK constraint would. The two columns
-- are stored sorted (userAId < userBId by string order, applied in
-- src/lib/stakePatterns.ts) so a pair has exactly one spelling; without that,
-- the constraint would let (A,B) and (B,A) both exist and enforce nothing.

CREATE TYPE "StakePatternStatus" AS ENUM ('OPEN', 'DISMISSED', 'ACTIONED');

CREATE TABLE "StakePatternFlag" (
    "id"            TEXT NOT NULL,
    "userAId"       TEXT NOT NULL,
    "userBId"       TEXT NOT NULL,
    "status"        "StakePatternStatus" NOT NULL DEFAULT 'OPEN',
    "reasons"       TEXT[] NOT NULL,
    "battleCount"   INTEGER NOT NULL,
    "userAWins"     INTEGER NOT NULL,
    "userBWins"     INTEGER NOT NULL,
    "netKobo"       INTEGER NOT NULL,
    "windowDays"    INTEGER NOT NULL,
    "firstBattleAt" TIMESTAMP(3),
    "lastBattleAt"  TIMESTAMP(3),
    "reviewedById"  TEXT,
    "reviewNote"    TEXT,
    "reviewedAt"    TIMESTAMP(3),
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StakePatternFlag_pkey" PRIMARY KEY ("id")
);

-- The dedupe. One open flag per pair, enforced by the database rather than by
-- the sweep remembering to check first — a sweep that overlaps itself (Vercel
-- Cron does not guarantee it won't) would otherwise race its own read and
-- write a second flag for the same pair.
CREATE UNIQUE INDEX "StakePatternFlag_open_pair_key"
    ON "StakePatternFlag" ("userAId", "userBId")
    WHERE "status" = 'OPEN';

CREATE INDEX "StakePatternFlag_status_createdAt_idx" ON "StakePatternFlag" ("status", "createdAt");
CREATE INDEX "StakePatternFlag_userAId_status_idx" ON "StakePatternFlag" ("userAId", "status");
CREATE INDEX "StakePatternFlag_userBId_status_idx" ON "StakePatternFlag" ("userBId", "status");

-- Cascade on the pair: a flag is evidence about two accounts, and if an
-- account is deleted the evidence is about nobody. SetNull on the reviewer,
-- matching how the rest of this schema treats staff references — the audit
-- log is where "who did this" is durable, not this row.
ALTER TABLE "StakePatternFlag" ADD CONSTRAINT "StakePatternFlag_userAId_fkey"
    FOREIGN KEY ("userAId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StakePatternFlag" ADD CONSTRAINT "StakePatternFlag_userBId_fkey"
    FOREIGN KEY ("userBId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StakePatternFlag" ADD CONSTRAINT "StakePatternFlag_reviewedById_fkey"
    FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- The four numbers the sweep reads, as platform settings rather than code
-- constants: the right ones depend on how much honest traffic a pair of
-- friends generates on this platform, which is not something to guess at
-- deploy time and not something to need a deploy to correct. Defaults are
-- chosen to be quiet rather than eager — see each one's schema comment.
ALTER TABLE "PlatformSetting"
  ADD COLUMN "stakePatternWindowDays" INTEGER NOT NULL DEFAULT 90,
  ADD COLUMN "stakePatternMinBattles" INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN "stakePatternWinShareBps" INTEGER NOT NULL DEFAULT 8000,
  ADD COLUMN "stakePatternNetAlertKobo" INTEGER NOT NULL DEFAULT 50000000;
