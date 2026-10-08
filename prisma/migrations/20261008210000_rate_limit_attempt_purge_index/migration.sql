-- Finding #14 of the security audit: the attempts table grew without bound.
--
-- The purge itself is in src/lib/rateLimit.ts (purgeExpiredAttempts) and runs from the scheduled sweep.
-- This migration is the index that makes it affordable.
--
-- The table already has a composite (key, createdAt), from the migration that created it. That index is
-- built for the read `isRateLimited` does — one key, rows inside a window — and it leads with `key`, so it
-- cannot serve the purge's `createdAt < cutoff` across every key at once. Postgres would fall back to a
-- sequential scan of precisely the table this fix exists to keep small, every two minutes, forever.
--
-- The write cost is real and is being accepted deliberately: this table takes an insert on essentially
-- every throttled request, and a second btree is roughly a second index update on each of them. That is
-- the trade — a slightly more expensive append, against a purge that is an index range scan returning
-- nothing on the runs where there is nothing to do, which is nearly all of them.

-- CreateIndex
CREATE INDEX "RateLimitAttempt_createdAt_idx" ON "RateLimitAttempt"("createdAt");
