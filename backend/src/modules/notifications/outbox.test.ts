import "../../config/load-dotenv";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ConfigService } from "../../config/config.service";
import { NotificationsService } from "./notifications.service";
import { EmailService } from "../../platform/email.service";
import { PrismaService } from "../../platform/prisma.service";
import { OutboxService } from "../../platform/outbox/outbox.service";

describe("Outbox relay — invariant I5", () => {
  const config = new ConfigService();
  const prisma = new PrismaService(config);
  const notifications = new NotificationsService(prisma, new EmailService(config), config);

  let orgId: string;
  let bookingId: string;

  beforeAll(async () => {
    const org = await prisma.client.organization.create({
      data: { slug: `outbox-test-${randomUUID()}`, name: "Outbox Test", timeZone: "UTC" },
    });
    const staff = await prisma.client.staffMember.create({
      data: { organizationId: org.id, displayName: "Staff", timeZone: "UTC" },
    });
    const service = await prisma.client.service.create({
      data: { organizationId: org.id, name: "Service", durationMin: 30 },
    });
    const client = await prisma.client.client.create({
      data: { organizationId: org.id, email: `outbox-${randomUUID()}@example.com` },
    });
    const booking = await prisma.client.booking.create({
      data: {
        organizationId: org.id,
        staffMemberId: staff.id,
        serviceId: service.id,
        clientId: client.id,
        startsAt: new Date("2030-01-01T10:00:00Z"),
        endsAt: new Date("2030-01-01T10:30:00Z"),
        clientTimeZone: "UTC",
        idempotencyKey: `outbox-${randomUUID()}`,
      },
    });
    orgId = org.id;
    bookingId = booking.id;
  }, 30_000);

  afterAll(async () => {
    await prisma.client.organization.delete({ where: { id: orgId } });
    await prisma.client.$disconnect();
  }, 30_000);

  it("processing the same event twice sends exactly one email", async () => {
    const outbox = new OutboxService(prisma);
    outbox.register("booking.confirmed", (event) =>
      notifications.handleBookingEvent(
        (event.payload as { bookingId: string }).bookingId,
        event.id,
        "confirmed",
      ),
    );

    const event = await prisma.client.outboxEvent.create({
      data: { type: "booking.confirmed", aggregateId: bookingId, payload: { bookingId } },
    });

    await outbox.processBatch();

    // Simulate a redelivery: reset the row as if the relay crashed after
    // the handler ran but before it recorded success.
    await prisma.client.outboxEvent.update({
      where: { id: event.id },
      data: { processedAt: null, attempts: 0 },
    });
    await outbox.processBatch();

    const deliveries = await prisma.client.emailDelivery.count({ where: { eventId: event.id } });
    expect(deliveries).toBe(1);

    const after = await prisma.client.outboxEvent.findUnique({ where: { id: event.id } });
    expect(after?.processedAt).not.toBeNull();
  }, 30_000);

  it("dead-letters an event whose type has no handler", async () => {
    const outbox = new OutboxService(prisma);
    const event = await prisma.client.outboxEvent.create({
      data: { type: "nobody.handles.this", aggregateId: bookingId, payload: { bookingId } },
    });

    await outbox.processBatch();

    const after = await prisma.client.outboxEvent.findUnique({ where: { id: event.id } });
    expect(after?.deadAt).not.toBeNull();
  }, 30_000);
});
