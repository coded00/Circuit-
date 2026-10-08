-- Staked Battles: a kill switch, and cumulative per-account stake limits.
--
-- MAX_STAKE_AMOUNT bounds one Battle. It says nothing about how many a single
-- account runs at once, and that is the exposure the repeated-pair collusion
-- path in docs/circuit-strategy.md §10 actually needs: two accounts trading
-- twenty concurrent NGN 100,000 Battles break no per-Battle rule and move NGN
-- 2,000,000 between themselves.
--
-- These are platform settings rather than code constants because the right
-- number is a business decision, and because a limit that can't be lowered
-- the moment something looks wrong is not much of a control.
--
-- stakedBattlesEnabled defaults true: the feature is live today, and this is
-- added as a switch to turn it OFF with, not to change its behaviour on the
-- way in.

ALTER TABLE "PlatformSetting"
  ADD COLUMN "stakedBattlesEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "maxLockedStakeKobo" INTEGER NOT NULL DEFAULT 50000000,
  ADD COLUMN "maxDailyStakeKobo" INTEGER NOT NULL DEFAULT 100000000;
