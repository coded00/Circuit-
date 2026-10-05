-- AlterEnum
ALTER TYPE "OrderStatus" ADD VALUE 'PENDING_PAYMENT';

-- CreateEnum
CREATE TYPE "OrderPaymentMethod" AS ENUM ('WALLET', 'CARD');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN "paymentMethod" "OrderPaymentMethod" NOT NULL DEFAULT 'WALLET',
ADD COLUMN "paymentProvider" "PaymentProviderName",
ADD COLUMN "paymentRef" TEXT,
ADD COLUMN "reservedUntil" TIMESTAMP(3),
ADD COLUMN "refundRef" TEXT,
ADD COLUMN "refundStatus" "WalletTransactionStatus";

-- CreateIndex
CREATE UNIQUE INDEX "Order_paymentRef_key" ON "Order"("paymentRef");

-- CreateIndex
CREATE UNIQUE INDEX "Order_refundRef_key" ON "Order"("refundRef");

-- CreateIndex
CREATE INDEX "Order_status_reservedUntil_idx" ON "Order"("status", "reservedUntil");
