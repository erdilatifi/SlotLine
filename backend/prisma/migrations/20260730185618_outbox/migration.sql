-- CreateTable
CREATE TABLE "OutboxEvent" (
    "id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "aggregateId" UUID NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMPTZ,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "deadAt" TIMESTAMPTZ,

    CONSTRAINT "OutboxEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailDelivery" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "recipient" CITEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "sentAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OutboxEvent_processedAt_deadAt_idx" ON "OutboxEvent"("processedAt", "deadAt");

-- CreateIndex
CREATE UNIQUE INDEX "EmailDelivery_eventId_recipient_key" ON "EmailDelivery"("eventId", "recipient");

-- AddForeignKey
ALTER TABLE "EmailDelivery" ADD CONSTRAINT "EmailDelivery_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "OutboxEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
