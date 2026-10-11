-- Daily Challenges, step 3: a refunded entry gives Circuit's cut back as its own ledger row, not by editing or
-- deleting the original CHALLENGE_PLATFORM_FEE. Added in its own migration because Postgres will not let a new enum
-- value be used in the transaction that adds it, and the entry/refund code that writes it ships with this step.

ALTER TYPE "EscrowType" ADD VALUE 'CHALLENGE_PLATFORM_FEE_REVERSAL';
