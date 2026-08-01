-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('PENDING', 'CONFIRMED', 'COMPLETED', 'NO_SHOW', 'CANCELLED', 'RESCHEDULED');

-- CreateTable
CREATE TABLE "Service" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "durationMin" INTEGER NOT NULL,
    "bufferBeforeMin" INTEGER NOT NULL DEFAULT 0,
    "bufferAfterMin" INTEGER NOT NULL DEFAULT 0,
    "priceMinor" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "capacity" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Service_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffMember" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "userId" UUID,
    "displayName" TEXT NOT NULL,
    "timeZone" TEXT NOT NULL,
    "isBookable" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "StaffMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduleRule" (
    "id" UUID NOT NULL,
    "staffMemberId" UUID NOT NULL,
    "weekday" INTEGER NOT NULL,
    "startHour" INTEGER NOT NULL,
    "startMinute" INTEGER NOT NULL,
    "endHour" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,

    CONSTRAINT "ScheduleRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimeOff" (
    "id" UUID NOT NULL,
    "staffMemberId" UUID NOT NULL,
    "startsAt" TIMESTAMPTZ NOT NULL,
    "endsAt" TIMESTAMPTZ NOT NULL,
    "reason" TEXT,

    CONSTRAINT "TimeOff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Client" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "email" CITEXT NOT NULL,
    "name" TEXT,
    "phone" TEXT,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Booking" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "staffMemberId" UUID NOT NULL,
    "serviceId" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "startsAt" TIMESTAMPTZ NOT NULL,
    "endsAt" TIMESTAMPTZ NOT NULL,
    "status" "BookingStatus" NOT NULL DEFAULT 'CONFIRMED',
    "clientTimeZone" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "actor" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "diff" JSONB,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Client_organizationId_email_key" ON "Client"("organizationId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_idempotencyKey_key" ON "Booking"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Booking_staffMemberId_startsAt_idx" ON "Booking"("staffMemberId", "startsAt");

-- AddForeignKey
ALTER TABLE "Service" ADD CONSTRAINT "Service_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffMember" ADD CONSTRAINT "StaffMember_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleRule" ADD CONSTRAINT "ScheduleRule_staffMemberId_fkey" FOREIGN KEY ("staffMemberId") REFERENCES "StaffMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeOff" ADD CONSTRAINT "TimeOff_staffMemberId_fkey" FOREIGN KEY ("staffMemberId") REFERENCES "StaffMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_staffMemberId_fkey" FOREIGN KEY ("staffMemberId") REFERENCES "StaffMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Invariant I1: no two active bookings for the same staff member may
-- overlap in time. Enforced by the database, not application code — see
-- docs/HANDBOOK_SUMMARY.md §7 and ADR-0005. Restricted to non-terminal
-- statuses so a cancelled/completed/no-show/rescheduled booking never
-- blocks a new one from claiming the same time.
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_no_overlap"
  EXCLUDE USING gist (
    "staffMemberId" WITH =,
    tstzrange("startsAt", "endsAt", '[)') WITH &&
  )
  WHERE (status IN ('PENDING', 'CONFIRMED'));
