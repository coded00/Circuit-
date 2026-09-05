-- AlterTable
ALTER TABLE "Report" ADD COLUMN     "evidenceRef" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "isSuspended" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "suspensionReason" TEXT;
