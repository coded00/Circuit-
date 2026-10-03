-- CreateTable
CREATE TABLE "TournamentUpdate" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TournamentUpdate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TournamentUpdate_tournamentId_createdAt_idx" ON "TournamentUpdate"("tournamentId", "createdAt");

-- AddForeignKey
ALTER TABLE "TournamentUpdate" ADD CONSTRAINT "TournamentUpdate_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentUpdate" ADD CONSTRAINT "TournamentUpdate_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

