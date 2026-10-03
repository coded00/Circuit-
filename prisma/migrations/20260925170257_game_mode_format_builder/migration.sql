-- CreateEnum
CREATE TYPE "CompetitionStyle" AS ENUM ('HEAD_TO_HEAD', 'LOBBY');

-- CreateEnum
CREATE TYPE "EntryType" AS ENUM ('INDIVIDUAL', 'TEAM');

-- AlterTable
ALTER TABLE "Game" ADD COLUMN     "category" TEXT,
ADD COLUMN     "coverUrl" TEXT,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "platforms" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "publishedAt" TIMESTAMP(3),
ADD COLUMN     "publisher" TEXT,
-- Defaulted so existing Game rows can take the new NOT NULL column.
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "GameMode" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "style" "CompetitionStyle" NOT NULL DEFAULT 'HEAD_TO_HEAD',
    "usesFormats" BOOLEAN NOT NULL DEFAULT true,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GameMode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameFormat" (
    "id" TEXT NOT NULL,
    "modeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "entryType" "EntryType" NOT NULL DEFAULT 'INDIVIDUAL',
    "playersPerTeam" INTEGER NOT NULL DEFAULT 1,
    "minRoster" INTEGER,
    "maxRoster" INTEGER,
    "teamsPerMatch" INTEGER,
    "maxPlayersPerMatch" INTEGER,
    "structures" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "defaultRules" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GameFormat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GameMode_gameId_sortOrder_idx" ON "GameMode"("gameId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "GameMode_gameId_name_key" ON "GameMode"("gameId", "name");

-- CreateIndex
CREATE INDEX "GameFormat_modeId_sortOrder_idx" ON "GameFormat"("modeId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "GameFormat_modeId_name_key" ON "GameFormat"("modeId", "name");

-- AddForeignKey
ALTER TABLE "GameMode" ADD CONSTRAINT "GameMode_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameFormat" ADD CONSTRAINT "GameFormat_modeId_fkey" FOREIGN KEY ("modeId") REFERENCES "GameMode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Games that existed before the catalog builder were already live in the
-- creation forms, so they start out published rather than dropping back to draft.
UPDATE "Game" SET "publishedAt" = "createdAt" WHERE "publishedAt" IS NULL;
