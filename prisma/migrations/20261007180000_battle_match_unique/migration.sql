-- One Match per Battle.
--
-- A Battle is a single head-to-head, so a second Match row pointing at the same battleId can only mean
-- the Battle was matched twice. That is not merely untidy — it is a double payout. Each Match settles
-- the Battle when it completes (settleBattleOnComplete in src/lib/matches.ts pays stakeAmount * 2 per
-- Match), so two Matches on one Battle pay the pot twice, and the second payout is unbacked: the second
-- accepter's stake was refunded to them when their accept attempt appeared to fail, while the Match it
-- had already created lived on behind a Battle that had been reopened to OPEN.
--
-- Tournament matches leave battleId null, and Postgres permits many nulls in a unique index, so this
-- constrains Battles only.

-- Refuse loudly, with a message that says what the duplicate means, rather than letting Postgres report
-- a bare duplicate-key error. A duplicate row here is itself evidence that the bug above already fired
-- in production, and each extra Match is a live row — so the migration must not pick a winner. Dropping
-- the extras would hide a real double-match, and which Match is "the" real one (by created time? by
-- status? by which one has a payout against it?) is a judgement call for a human with the data in front
-- of them, not for a migration.
DO $$
DECLARE dupes TEXT;
BEGIN
  SELECT string_agg(d."battleId", ', ' ORDER BY d."battleId") INTO dupes
    FROM (
      SELECT "battleId" FROM "Match"
      WHERE "battleId" IS NOT NULL
      GROUP BY "battleId" HAVING count(*) > 1
    ) d;

  IF dupes IS NOT NULL THEN
    RAISE EXCEPTION 'Match.battleId cannot be made unique: these Battles already have more than one Match: %. Each extra Match is a second, unbacked pot payout waiting to happen — see this migration''s comment. Investigate before applying.', dupes
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
END $$;

-- The old plain index on the same column is now redundant — the unique index it becomes serves the same
-- lookups (Prisma's own diff would drop it as part of adding @unique).
DROP INDEX "Match_battleId_idx";
CREATE UNIQUE INDEX "Match_battleId_key" ON "Match"("battleId");
