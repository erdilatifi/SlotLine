import "../../config/load-dotenv";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ConfigService } from "../../config/config.service";
import { ConflictError } from "../../platform/errors";
import { PrismaService } from "../../platform/prisma.service";
import { RealtimeService } from "../../platform/realtime.service";
import { BookingsService } from "./bookings.service";

describe("BookingsService — rescheduling", () => {
  const prisma = new PrismaService(new ConfigService());
  const bookings = new BookingsService(prisma, new RealtimeService());

  let organizationId: string;
  let staffMemberId: string;
  let serviceId: string;
  let clientId: string;

  const at = (hour: number) => new Date(Date.UTC(2031, 2, 4, hour, 0, 0));

  async function book(hour: number) {
    return bookings.create({
      organizationId,
      staffMemberId,
      serviceId,
      clientEmail: `resched-${randomUUID()}@example.com`,
      startsAt: at(hour),
      endsAt: at(hour + 1),
      clientTimeZone: "UTC",
      idempotencyKey: randomUUID(),
      actor: "test",
    });
  }

  beforeAll(async () => {
    const org = await prisma.client.organization.create({
      data: { slug: `resched-${randomUUID()}`, name: "Reschedule Test", timeZone: "UTC" },
    });
    organizationId = org.id;
    const staff = await prisma.client.staffMember.create({
      data: { organizationId, displayName: "Tester", timeZone: "UTC" },
    });
    staffMemberId = staff.id;
    const service = await prisma.client.service.create({
      data: { organizationId, name: "Session", durationMin: 60 },
    });
    serviceId = service.id;
    const client = await prisma.client.client.create({
      data: { organizationId, email: `resched-owner-${randomUUID()}@example.com` },
    });
    clientId = client.id;
  });

  afterAll(async () => {
    const ids = await prisma.client.booking.findMany({
      where: { organizationId },
      select: { id: true },
    });
    await prisma.client.outboxEvent.deleteMany({
      where: { aggregateId: { in: ids.map((b) => b.id) } },
    });
    await prisma.client.auditLog.deleteMany({ where: { organizationId } });
    await prisma.client.booking.deleteMany({ where: { organizationId } });
    await prisma.client.client.deleteMany({ where: { organizationId } });
    await prisma.client.service.deleteMany({ where: { organizationId } });
    await prisma.client.staffMember.deleteMany({ where: { organizationId } });
    await prisma.client.organization.delete({ where: { id: organizationId } });
    await prisma.client.$disconnect();
  });

  it("gives every booking an unguessable manage token", async () => {
    const booking = await book(9);
    expect(booking.manageToken).toBeTruthy();
    // 32 bytes, base64url — long enough that guessing is not a strategy.
    expect(booking.manageToken!.length).toBeGreaterThanOrEqual(40);
  });

  it("moves a booking, retires the original, and links the two", async () => {
    const original = await book(11);
    const moved = await bookings.reschedule(original.id, at(13), at(14), "client:test");

    const before = await prisma.client.booking.findUnique({ where: { id: original.id } });
    expect(before?.status).toBe("RESCHEDULED");
    expect(before?.rescheduledToId).toBe(moved.id);
    expect(moved.status).toBe("CONFIRMED");
    expect(moved.startsAt.toISOString()).toBe(at(13).toISOString());
    // The old link must stop working; the new one is what the client gets.
    expect(moved.manageToken).not.toBe(original.manageToken);
  });

  it("refuses a clash and leaves the client's original booking intact", async () => {
    const mine = await book(15);
    const theirs = await book(17);

    await expect(
      bookings.reschedule(mine.id, theirs.startsAt, theirs.endsAt, "client:test"),
    ).rejects.toThrow(ConflictError);

    // The whole point: a failed move must not cost someone their appointment.
    const after = await prisma.client.booking.findUnique({ where: { id: mine.id } });
    expect(after?.status).toBe("CONFIRMED");
    expect(after?.startsAt.toISOString()).toBe(at(15).toISOString());
  });

  it("will not move a cancelled booking", async () => {
    const booking = await book(19);
    await bookings.cancel(booking.id, "client:test");
    await expect(bookings.reschedule(booking.id, at(21), at(22), "client:test")).rejects.toThrow(
      ConflictError,
    );
  });

  it("frees the original slot, so the time can be booked again", async () => {
    const booking = await book(7);
    await bookings.reschedule(booking.id, at(23), at(24), "client:test");

    const retaken = await prisma.client.booking.create({
      data: {
        organizationId,
        staffMemberId,
        serviceId,
        clientId,
        startsAt: at(7),
        endsAt: at(8),
        clientTimeZone: "UTC",
        idempotencyKey: randomUUID(),
      },
    });
    expect(retaken.status).toBe("CONFIRMED");
  });
});
