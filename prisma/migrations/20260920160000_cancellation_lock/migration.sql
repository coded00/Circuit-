-- AlterTable
ALTER TABLE "PlatformSetting" ADD COLUMN     "cancellationLockHoursBeforeStart" INTEGER NOT NULL DEFAULT 24;

-- AlterTable
ALTER TABLE "Tournament" ADD COLUMN     "cancellationLockAt" TIMESTAMP(3);
