-- Safe: no row has used the value STAKE_PAYOUT_CREDIT yet (added and
-- renamed within the same uncommitted session before any code wrote it).
ALTER TYPE "WalletTransactionType" RENAME VALUE 'STAKE_PAYOUT_CREDIT' TO 'STAKE_CREDIT';
