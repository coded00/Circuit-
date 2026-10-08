-- Self-exclusion / cool-off: a bar a player puts on their own account.
--
-- Finding #7 of the 2026-10-07 security audit asks for this alongside the
-- cumulative stake limits that landed in 20261007200000_staked_battle_limits.
-- `lockStake` (src/lib/stakes.ts) is the enforcement point — it is the only
-- thing on Circuit that debits a wallet for a stake — so an excluded player
-- cannot open, host or accept a staked Battle until it lifts, by whichever of
-- the four paths they try.
--
-- Both columns nullable, no default, no backfill: null is "not excluded",
-- which is what every existing account is. Nothing to migrate.
--
-- `selfExcludedUntil` is an absolute timestamp rather than a duration or a
-- boolean, because it has to answer "until when" on its own, and because a
-- rolling duration would need something to count from. An expired timestamp
-- is not an exclusion, so nothing has to clear these when a cool-off ends —
-- the row stays as the record that there was one.
--
-- `selfExcludedAt` is the start of the current run, kept separately because
-- an extension overwrites "when did they last touch this" but must not
-- overwrite "how long have they been on a break".

ALTER TABLE "User"
  ADD COLUMN "selfExcludedUntil" TIMESTAMP(3),
  ADD COLUMN "selfExcludedAt" TIMESTAMP(3);
