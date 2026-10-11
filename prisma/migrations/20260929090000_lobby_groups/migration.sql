-- CreateEnum
CREATE TYPE "LobbyStage" AS ENUM ('MAIN', 'GROUP', 'FINAL');

-- AlterTable
ALTER TABLE "LobbyRound" ADD COLUMN     "group" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "stage" "LobbyStage" NOT NULL DEFAULT 'MAIN',
ADD COLUMN     "stageRound" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Registration" ADD COLUMN     "lobbyFinalist" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lobbyGroup" INTEGER;

-- AlterTable
ALTER TABLE "Tournament" ADD COLUMN     "lobbyFinalRounds" INTEGER,
ADD COLUMN     "lobbyGroups" INTEGER,
ADD COLUMN     "lobbyQualifiers" INTEGER;


-- Existing lobby rounds are single-lobby rounds: their stage round is their number.
UPDATE "LobbyRound" SET "stageRound" = "number" WHERE "stageRound" = 0;
