-- Finding #3 of the security audit, follow-up two of two: the sponsorship-funding record.
--
-- A staff-run tournament is sponsored — its prize is paid from Circuit's own balance, so the rule that a
-- prize cannot exceed the entry fees collected does not apply to it. Two things bound that now: the prize
-- has a ceiling (maxSponsoredPrizeKobo), and it needs an approver who is neither the organizer nor a winner
-- (payoutApproval.ts). What was still missing is any record of where the money comes from. The approval row
-- named who said yes and nothing named what they were saying yes to.
--
-- This is that record, and it is required: a sponsored prize with no sponsorship recorded, or one recorded
-- for less than the payout's unbacked amount, cannot be approved by anyone. Recorded as a declaration, not
-- a ledger — it moves no money and reserves none. Checked against the payout at approval time.
--
-- tournamentId is UNIQUE rather than a plain index: a tournament has one sponsorship or none, and making
-- that a database constraint rather than a convention is what keeps "the sponsorship" a thing a reader can
-- look up without deciding which row they meant.

-- CreateTable
CREATE TABLE "TournamentSponsorship" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "recordedById" TEXT NOT NULL,
    "amountKobo" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TournamentSponsorship_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TournamentSponsorship_tournamentId_key" ON "TournamentSponsorship"("tournamentId");

-- CreateIndex
CREATE INDEX "TournamentSponsorship_recordedById_idx" ON "TournamentSponsorship"("recordedById");

-- AddForeignKey
ALTER TABLE "TournamentSponsorship" ADD CONSTRAINT "TournamentSponsorship_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentSponsorship" ADD CONSTRAINT "TournamentSponsorship_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
