-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PAID', 'FULFILLED', 'CANCELLED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "WalletTransactionType" ADD VALUE 'MARKETPLACE_DEBIT';
ALTER TYPE "WalletTransactionType" ADD VALUE 'MARKETPLACE_REFUND';

-- AlterTable
ALTER TABLE "Listing" ADD COLUMN     "buyerPrompt" TEXT,
ADD COLUMN     "stock" INTEGER;

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "listingTitle" TEXT NOT NULL,
    "category" "ListingCategory" NOT NULL,
    "amountKobo" INTEGER NOT NULL,
    "buyerNote" TEXT,
    "status" "OrderStatus" NOT NULL DEFAULT 'PAID',
    "fulfilmentNote" TEXT,
    "fulfilledAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Order_buyerId_createdAt_idx" ON "Order"("buyerId", "createdAt");

-- CreateIndex
CREATE INDEX "Order_status_createdAt_idx" ON "Order"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Order_listingId_idx" ON "Order"("listingId");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

