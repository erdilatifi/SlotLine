-- CreateTable
CREATE TABLE "Hold" (
    "id" UUID NOT NULL,
    "staffMemberId" UUID NOT NULL,
    "startsAt" TIMESTAMPTZ NOT NULL,
    "endsAt" TIMESTAMPTZ NOT NULL,
    "expiresAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "Hold_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Hold_staffMemberId_idx" ON "Hold"("staffMemberId");
