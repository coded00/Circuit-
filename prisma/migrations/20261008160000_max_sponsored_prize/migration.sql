-- Finding #3 of the security audit, follow-up one of two.
--
-- An ordinary tournament's cash prize is capped at the entry fees it could collect, because that is
-- where the money comes from (src/lib/prizePool.ts). A staff-run tournament is *sponsored*: the prize
-- comes out of Circuit's own balance, so the cap is skipped — and until now there was nothing in its
-- place. A staff organizer could declare an arbitrary prize, collect nothing, register a confederate,
-- let the bracket finish, and have the prize transferred from the platform's Paystack balance.
--
-- This adds the ceiling that exemption should always have had. It is a PlatformSetting rather than a
-- code constant for the same reason every other money bound here is: the right figure depends on what
-- staff actually run, and a bound that cannot be raised for a real flagship event is one staff will
-- route around rather than respect.
--
-- NGN 5,000,000 default. ₦5m is 10x the automatic-approval limit (so a sponsored prize is always a
-- deliberate human decision), comfortably inside INT4, and large enough that a genuine sponsored
-- tournament never notices it.

ALTER TABLE "PlatformSetting"
  ADD COLUMN "maxSponsoredPrizeKobo" INTEGER NOT NULL DEFAULT 500000000;
