-- AlterTable
ALTER TABLE "PlatformSetting" ADD COLUMN "payoutAutoApprove" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "payoutAutoApproveMaxKobo" INTEGER NOT NULL DEFAULT 50000000;
