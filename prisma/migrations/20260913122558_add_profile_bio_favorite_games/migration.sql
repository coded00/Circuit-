-- AlterTable
ALTER TABLE "User" ADD COLUMN     "bio" TEXT,
ADD COLUMN     "favoriteGames" TEXT[] DEFAULT ARRAY[]::TEXT[];
