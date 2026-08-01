-- CreateTable
CREATE TABLE "CalendarConnection" (
    "id" UUID NOT NULL,
    "staffMemberId" UUID NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'google',
    "googleCalendarId" TEXT NOT NULL DEFAULT 'primary',
    "refreshTokenEnc" TEXT NOT NULL,
    "syncToken" TEXT,
    "revokedAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CalendarConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarEventMapping" (
    "id" UUID NOT NULL,
    "connectionId" UUID NOT NULL,
    "bookingId" UUID NOT NULL,
    "googleEventId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CalendarEventMapping_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CalendarConnection_staffMemberId_key" ON "CalendarConnection"("staffMemberId");

-- CreateIndex
CREATE INDEX "CalendarEventMapping_googleEventId_idx" ON "CalendarEventMapping"("googleEventId");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarEventMapping_connectionId_bookingId_key" ON "CalendarEventMapping"("connectionId", "bookingId");

-- AddForeignKey
ALTER TABLE "CalendarConnection" ADD CONSTRAINT "CalendarConnection_staffMemberId_fkey" FOREIGN KEY ("staffMemberId") REFERENCES "StaffMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEventMapping" ADD CONSTRAINT "CalendarEventMapping_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "CalendarConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
