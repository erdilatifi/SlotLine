-- Google-created accounts genuinely have no password. Nullable is the
-- honest representation; login refuses when it's null rather than
-- comparing against an empty string.
ALTER TABLE "User" ALTER COLUMN "passwordHash" DROP NOT NULL;

-- Set once we've seen this Google account, so a returning user is matched
-- by their stable Google subject rather than only by email.
ALTER TABLE "User" ADD COLUMN "googleId" TEXT;
CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");
