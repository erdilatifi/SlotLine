import "../../config/load-dotenv";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ConfigService } from "../../config/config.service";
import { ConflictError } from "../../platform/errors";
import { PrismaService } from "../../platform/prisma.service";
import { RealtimeService } from "../../platform/realtime.service";
import { BookingsService } from "./bookings.service";

describe("BookingsService — concurrent booking creation", () => {
  const prisma = new PrismaService(new ConfigService());
  const bookings = new BookingsService(prisma, new RealtimeService());

  let orgId: string;
  let staffMemberId: string;
  let serviceId: string;

  beforeAll(async () => {
    const org = await prisma.client.organization.create({
      data: { slug: `concurrency-test-${randomUUID()}`, name: "Concurrency Test", timeZone: "UTC" },
    });
    const staff = await prisma.client.staffMember.create({
      data: { organizationId: org.id, displayName: "Staff", timeZone: "UTC" },
    });
    const service = await prisma.client.service.create({
      data: { organizationId: org.id, name: "Service", durationMin: 30 },
    });
    orgId = org.id;
    staffMemberId = staff.id;
    serviceId = service.id;
  });

  afterAll(async () => {
    await prisma.client.booking.deleteMany({ where: { organizationId: orgId } });
    await prisma.client.organization.delete({ where: { id: orgId } });
    await prisma.client.$disconnect();
  }, 30_000);

  it("exactly one of 200 concurrent requests for the same slot succeeds", async () => {
    const startsAt = new Date("2028-06-01T10:00:00Z");
    const endsAt = new Date("2028-06-01T10:30:00Z");

    const attempts = Array.from({ length: 200 }, (_, i) =>
      bookings
        .create({
          organizationId: orgId,
          staffMemberId,
          serviceId,
          clientEmail: `client-${i}@example.com`,
          startsAt,
          endsAt,
          clientTimeZone: "UTC",
          idempotencyKey: `concurrency-${randomUUID()}`,
          actor: "test",
        })
        .then(() => "fulfilled" as const)
        .catch((err: unknown) => (err instanceof ConflictError ? "rejected" : "unexpected")),
    );

    const results = await Promise.all(attempts);
    const succeeded = results.filter((r) => r === "fulfilled").length;
    const rejected = results.filter((r) => r === "rejected").length;
    const unexpected = results.filter((r) => r === "unexpected").length;

    expect(unexpected).toBe(0);
    expect(succeeded).toBe(1);
    expect(rejected).toBe(199);

    const confirmedCount = await prisma.client.booking.count({
      where: { staffMemberId, status: "CONFIRMED" },
    });
    expect(confirmedCount).toBe(1);
  }, 60_000);

  it("retrying the same idempotency key returns the original booking, not a duplicate", async () => {
    const key = `idempotency-${randomUUID()}`;
    const input = {
      organizationId: orgId,
      staffMemberId,
      serviceId,
      clientEmail: "idempotent-client@example.com",
      startsAt: new Date("2029-01-01T09:00:00Z"),
      endsAt: new Date("2029-01-01T09:30:00Z"),
      clientTimeZone: "UTC",
      idempotencyKey: key,
      actor: "test",
    };

    const first = await bookings.create(input);
    const second = await bookings.create(input);
    expect(second.id).toBe(first.id);

    const count = await prisma.client.booking.count({ where: { idempotencyKey: key } });
    expect(count).toBe(1);
  });
});
