import "../../config/load-dotenv";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ConfigService } from "../../config/config.service";
import { PrismaService } from "../../platform/prisma.service";
import type { TenantRequest } from "../organizations";
import { CatalogController } from "./catalog.controller";

describe("CatalogController — retiring vs deleting", () => {
  const prisma = new PrismaService(new ConfigService());
  const controller = new CatalogController(prisma);

  let organizationId: string;
  let staffMemberId: string;
  const req = () => ({ organizationId, role: "OWNER", userId: "test" }) as TenantRequest;

  beforeAll(async () => {
    const org = await prisma.client.organization.create({
      data: { slug: `catalog-${randomUUID()}`, name: "Catalog Test", timeZone: "UTC" },
    });
    organizationId = org.id;
    const staff = await prisma.client.staffMember.create({
      data: { organizationId, displayName: "Tester", timeZone: "UTC" },
    });
    staffMemberId = staff.id;
  });

  afterAll(async () => {
    await prisma.client.booking.deleteMany({ where: { organizationId } });
    await prisma.client.client.deleteMany({ where: { organizationId } });
    await prisma.client.service.deleteMany({ where: { organizationId } });
    await prisma.client.timeOff.deleteMany({ where: { staffMemberId } });
    await prisma.client.staffMember.deleteMany({ where: { organizationId } });
    await prisma.client.organization.delete({ where: { id: organizationId } });
    await prisma.client.$disconnect();
  });

  it("hard-deletes a service nobody has booked", async () => {
    const service = await controller.createService(req(), {
      name: "Never booked",
      durationMin: 30,
      priceMinor: 0,
      currency: "USD",
      bufferBeforeMin: 0,
      bufferAfterMin: 0,
    });

    expect(await controller.deleteService(req(), service.id)).toEqual({ outcome: "deleted" });
    expect(await prisma.client.service.findUnique({ where: { id: service.id } })).toBeNull();
  });

  it("retires a booked service instead, so its history survives", async () => {
    const service = await controller.createService(req(), {
      name: "Has history",
      durationMin: 30,
      priceMinor: 0,
      currency: "USD",
      bufferBeforeMin: 0,
      bufferAfterMin: 0,
    });
    const client = await prisma.client.client.create({
      data: { organizationId, email: `retire-${randomUUID()}@example.com` },
    });
    const booking = await prisma.client.booking.create({
      data: {
        organizationId,
        staffMemberId,
        serviceId: service.id,
        clientId: client.id,
        startsAt: new Date("2030-01-01T10:00:00Z"),
        endsAt: new Date("2030-01-01T10:30:00Z"),
        clientTimeZone: "UTC",
        idempotencyKey: randomUUID(),
      },
    });

    expect(await controller.deleteService(req(), service.id)).toEqual({ outcome: "retired" });

    const after = await prisma.client.service.findUnique({ where: { id: service.id } });
    expect(after?.isActive).toBe(false);
    expect(await prisma.client.booking.findUnique({ where: { id: booking.id } })).not.toBeNull();
  });

  it("refuses time off that ends before it starts", async () => {
    await expect(
      controller.createTimeOff(req(), staffMemberId, {
        startsAt: "2030-05-02T09:00:00.000Z",
        endsAt: "2030-05-01T09:00:00.000Z",
      }),
    ).rejects.toThrow(/end after it starts/);
  });
});
