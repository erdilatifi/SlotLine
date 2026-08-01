-- A capability URL per booking, so a guest can manage their own appointment
-- without an account. Nullable: bookings made before this migration have no
-- token, and the notification templates omit the link rather than break.
ALTER TABLE "Booking" ADD COLUMN "manageToken" TEXT;
ALTER TABLE "Booking" ADD COLUMN "rescheduledToId" UUID;

CREATE UNIQUE INDEX "Booking_manageToken_key" ON "Booking"("manageToken");

-- The dashboard reads bookings for one organisation ordered by start time
-- on every load; without this it is a sequential scan of the whole table.
CREATE INDEX "Booking_organizationId_startsAt_idx" ON "Booking"("organizationId", "startsAt");
