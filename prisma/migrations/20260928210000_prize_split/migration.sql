-- AlterTable
ALTER TABLE "EscrowTransaction" ADD COLUMN     "place" INTEGER;

-- AlterTable
ALTER TABLE "Tournament" ADD COLUMN     "prizeSplit" INTEGER[] DEFAULT ARRAY[]::INTEGER[];

