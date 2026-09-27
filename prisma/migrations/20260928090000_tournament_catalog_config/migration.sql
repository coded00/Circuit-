-- AlterTable
ALTER TABLE "Tournament" ADD COLUMN     "competitionStyle" "CompetitionStyle" NOT NULL DEFAULT 'HEAD_TO_HEAD',
ADD COLUMN     "entryType" "EntryType" NOT NULL DEFAULT 'INDIVIDUAL',
ADD COLUMN     "formatName" TEXT,
ADD COLUMN     "gameFormatId" TEXT,
ADD COLUMN     "gameId" TEXT,
ADD COLUMN     "gameModeId" TEXT,
ADD COLUMN     "modeName" TEXT,
ADD COLUMN     "playersPerTeam" INTEGER NOT NULL DEFAULT 1;

-- AddForeignKey
ALTER TABLE "Tournament" ADD CONSTRAINT "Tournament_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tournament" ADD CONSTRAINT "Tournament_gameModeId_fkey" FOREIGN KEY ("gameModeId") REFERENCES "GameMode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tournament" ADD CONSTRAINT "Tournament_gameFormatId_fkey" FOREIGN KEY ("gameFormatId") REFERENCES "GameFormat"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Link existing tournaments to their catalog game by name where one matches.
UPDATE "Tournament" t SET "gameId" = g."id" FROM "Game" g WHERE t."gameId" IS NULL AND lower(g."name") = lower(t."game");
