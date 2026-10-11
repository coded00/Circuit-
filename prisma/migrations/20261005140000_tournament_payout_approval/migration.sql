-- AlterTable
ALTER TABLE "Tournament" ADD COLUMN "payoutApprovedAt" TIMESTAMP(3),
ADD COLUMN "payoutApprovedById" TEXT,
ADD COLUMN "payoutApprovalNote" TEXT;
