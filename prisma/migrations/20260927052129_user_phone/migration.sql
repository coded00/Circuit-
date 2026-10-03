-- AlterTable
ALTER TABLE "User" ADD COLUMN     "phone" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");


-- Accounts that signed up with a phone number (before email and phone were
-- separate fields) keep being able to log in with it: copy a Nigerian mobile
-- in emailOrPhone into the new phone column, in +234 form. Only where the
-- result is unique, so the unique index can't be violated.
UPDATE "User" u
SET "phone" = '+234' || right(regexp_replace(u."emailOrPhone", '\D', '', 'g'), 10)
WHERE u."phone" IS NULL
  AND regexp_replace(u."emailOrPhone", '\D', '', 'g') ~ '^(234|0)?[789][01][0-9]{8}$'
  AND u."emailOrPhone" !~ '@'
  AND NOT EXISTS (
    SELECT 1 FROM "User" o
    WHERE o.id <> u.id
      AND right(regexp_replace(o."emailOrPhone", '\D', '', 'g'), 10) = right(regexp_replace(u."emailOrPhone", '\D', '', 'g'), 10)
      AND o."emailOrPhone" !~ '@'
  );
