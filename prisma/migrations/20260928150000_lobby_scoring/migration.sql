-- CreateEnum
CREATE TYPE "LobbyRoundStatus" AS ENUM ('PENDING', 'POSTED');

-- CreateEnum
CREATE TYPE "LobbyFlagStatus" AS ENUM ('OPEN', 'ESCALATED', 'RESOLVED', 'DISMISSED');

-- AlterTable
ALTER TABLE "GameFormat" ADD COLUMN     "killPoints" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "placementPoints" INTEGER[] DEFAULT ARRAY[]::INTEGER[];

-- AlterTable
ALTER TABLE "Tournament" ADD COLUMN     "killPoints" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "lobbyRounds" INTEGER,
ADD COLUMN     "placementPoints" INTEGER[] DEFAULT ARRAY[]::INTEGER[];

-- CreateTable
CREATE TABLE "LobbyRound" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "status" "LobbyRoundStatus" NOT NULL DEFAULT 'PENDING',
    "proofUrl" TEXT,
    "postedAt" TIMESTAMP(3),
    "postedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LobbyRound_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LobbyResult" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "registrationId" TEXT NOT NULL,
    "placement" INTEGER,
    "kills" INTEGER NOT NULL DEFAULT 0,
    "points" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "LobbyResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LobbyFlag" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "LobbyFlagStatus" NOT NULL DEFAULT 'OPEN',
    "response" TEXT,
    "respondedById" TEXT,
    "escalatedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LobbyFlag_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LobbyRound_tournamentId_number_key" ON "LobbyRound"("tournamentId", "number");

-- CreateIndex
CREATE INDEX "LobbyResult_registrationId_idx" ON "LobbyResult"("registrationId");

-- CreateIndex
CREATE UNIQUE INDEX "LobbyResult_roundId_registrationId_key" ON "LobbyResult"("roundId", "registrationId");

-- CreateIndex
CREATE INDEX "LobbyFlag_roundId_status_idx" ON "LobbyFlag"("roundId", "status");

-- AddForeignKey
ALTER TABLE "LobbyRound" ADD CONSTRAINT "LobbyRound_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LobbyResult" ADD CONSTRAINT "LobbyResult_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "LobbyRound"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LobbyResult" ADD CONSTRAINT "LobbyResult_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "Registration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LobbyFlag" ADD CONSTRAINT "LobbyFlag_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "LobbyRound"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LobbyFlag" ADD CONSTRAINT "LobbyFlag_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

