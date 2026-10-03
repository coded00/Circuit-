-- CreateEnum
CREATE TYPE "MessageKind" AS ENUM ('TEXT', 'IMAGE', 'STICKER');

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "attachmentHeight" INTEGER,
ADD COLUMN     "attachmentRef" TEXT,
ADD COLUMN     "attachmentWidth" INTEGER,
ADD COLUMN     "kind" "MessageKind" NOT NULL DEFAULT 'TEXT',
ADD COLUMN     "stickerId" TEXT,
ALTER COLUMN "content" SET DEFAULT '';
