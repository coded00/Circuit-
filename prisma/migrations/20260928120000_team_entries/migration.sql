-- AlterTable
ALTER TABLE "Registration" ADD COLUMN     "teamId" TEXT,
ADD COLUMN     "teamName" TEXT;

-- AlterTable
ALTER TABLE "Tournament" ADD COLUMN     "maxRoster" INTEGER,
ADD COLUMN     "minRoster" INTEGER;

-- CreateTable
CREATE TABLE "RosterMember" (
    "id" TEXT NOT NULL,
    "registrationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "inGameId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RosterMember_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RosterMember_userId_idx" ON "RosterMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "RosterMember_registrationId_userId_key" ON "RosterMember"("registrationId", "userId");

-- AddForeignKey
ALTER TABLE "Registration" ADD CONSTRAINT "Registration_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RosterMember" ADD CONSTRAINT "RosterMember_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "Registration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RosterMember" ADD CONSTRAINT "RosterMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

