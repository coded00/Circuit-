-- CreateEnum
CREATE TYPE "StreamPlatform" AS ENUM ('TWITCH', 'YOUTUBE', 'KICK', 'OTHER', 'CIRCUIT');

-- CreateEnum
CREATE TYPE "StreamMode" AS ENUM ('TOURNAMENT_AND_PLAYERS', 'TOURNAMENT_ONLY', 'PLAYERS_ONLY', 'NONE');

-- AlterTable
ALTER TABLE "Tournament" ADD COLUMN "streamMode" "StreamMode" NOT NULL DEFAULT 'NONE',
ADD COLUMN "streamPlatform" "StreamPlatform",
ADD COLUMN "streamPlatformName" TEXT;

-- AlterTable
ALTER TABLE "Registration" ADD COLUMN "streamPlatform" "StreamPlatform",
ADD COLUMN "streamPlatformName" TEXT,
ADD COLUMN "streamUrl" TEXT;

-- Tournaments that already had a stream link keep it: it becomes the tournament's own stream, on the
-- platform its address belongs to.
UPDATE "Tournament"
SET "streamMode" = 'TOURNAMENT_ONLY',
    "streamPlatform" = CASE
      WHEN "streamUrl" ~* '^https?://([a-z0-9-]+\.)*twitch\.tv(/|\?|$)' THEN 'TWITCH'::"StreamPlatform"
      WHEN "streamUrl" ~* '^https?://([a-z0-9-]+\.)*(youtube\.com|youtu\.be)(/|\?|$)' THEN 'YOUTUBE'::"StreamPlatform"
      WHEN "streamUrl" ~* '^https?://([a-z0-9-]+\.)*kick\.com(/|\?|$)' THEN 'KICK'::"StreamPlatform"
      ELSE 'OTHER'::"StreamPlatform"
    END,
    "streamPlatformName" = CASE
      WHEN "streamUrl" ~* '^https?://([a-z0-9-]+\.)*(twitch\.tv|youtube\.com|youtu\.be|kick\.com)(/|\?|$)' THEN NULL
      ELSE 'Stream'
    END
WHERE "streamUrl" IS NOT NULL AND "streamUrl" <> '';
