import "../../config/load-dotenv";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ConfigService } from "../../config/config.service";
import { ConflictError } from "../../platform/errors";
import { PrismaService } from "../../platform/prisma.service";
import { HoldsService } from "./holds.service";

describe("HoldsService — holding and releasing a slot", () => {
  const prisma = new PrismaService(new ConfigService());
  const holds = new HoldsService(prisma);

  let organizationId: string;
  let staffMemberId: string;

  const at = (hour: number) => new Date(Date.UTC(2032, 5, 8, hour, 0, 0));

  beforeAll(async () => {
    const org = await prisma.client.organization.create({
      data: { slug: `holds-${randomUUID()}`, name: "Holds Test", timeZone: "UTC" },
    });
    organizationId = org.id;
    const staff = await prisma.client.staffMember.create({
      data: { organizationId, displayName: "Tester", timeZone: "UTC" },
    });
    staffMemberId = staff.id;
  });

  afterAll(async () => {
    await prisma.client.hold.deleteMany({ where: { staffMemberId } });
    await prisma.client.staffMember.deleteMany({ where: { organizationId } });
    await prisma.client.organization.delete({ where: { id: organizationId } });
    await prisma.client.$disconnect();
  });

  it("refuses a second hold on a slot that is already held", async () => {
    const first = await holds.create(staffMemberId, at(9), at(10));
    await expect(holds.create(staffMemberId, at(9), at(10))).rejects.toThrow(ConflictError);
    await holds.release(first.id);
  });

  /**
   * The one that mattered: backing out of the form and picking the same time
   * again used to collide with your own hold, and the funnel reported it as
   * "someone just took that time" — about yourself.
   */
  it("lets the same slot be taken again once the hold is released", async () => {
    const first = await holds.create(staffMemberId, at(11), at(12));
    await holds.release(first.id);

    const second = await holds.create(staffMemberId, at(11), at(12));
    expect(second.id).not.toBe(first.id);
    await holds.release(second.id);
  });

  it("treats releasing an unknown or already-released hold as a no-op", async () => {
    const hold = await holds.create(staffMemberId, at(14), at(15));
    await holds.release(hold.id);
    // Releasing twice, and releasing something that never existed, must not throw.
    await expect(holds.release(hold.id)).resolves.toBeUndefined();
    await expect(holds.release(randomUUID())).resolves.toBeUndefined();
  });

  it("does not block a slot that only touches the held one at its edge", async () => {
    const held = await holds.create(staffMemberId, at(16), at(17));
    // Ranges are half-open, so 17:00–18:00 starts exactly where the other ends.
    const adjacent = await holds.create(staffMemberId, at(17), at(18));
    expect(adjacent.id).toBeTruthy();
    await holds.release(held.id);
    await holds.release(adjacent.id);
  });
});
