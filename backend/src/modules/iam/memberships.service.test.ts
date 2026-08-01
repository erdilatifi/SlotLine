import "../../config/load-dotenv";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ConfigService } from "../../config/config.service";
import { PrismaService } from "../../platform/prisma.service";
import { MembershipsService } from "./memberships.service";

describe("MembershipsService — last-owner rule", () => {
  const prisma = new PrismaService(new ConfigService());
  const memberships = new MembershipsService(prisma);

  let orgId: string;
  let ownerId: string;
  let staffId: string;

  beforeAll(async () => {
    const owner = await prisma.client.user.create({
      data: { email: `owner-${randomUUID()}@example.com`, passwordHash: "unused" },
    });
    const staff = await prisma.client.user.create({
      data: { email: `staff-${randomUUID()}@example.com`, passwordHash: "unused" },
    });
    const org = await prisma.client.organization.create({
      data: {
        slug: `test-org-${randomUUID()}`,
        name: "Test Org",
        timeZone: "UTC",
        memberships: { create: { userId: owner.id, role: "OWNER" } },
      },
    });
    ownerId = owner.id;
    staffId = staff.id;
    orgId = org.id;
    await memberships.add(orgId, staff.email, "STAFF");
  });

  afterAll(async () => {
    await prisma.client.organization.delete({ where: { id: orgId } });
    await prisma.client.user.deleteMany({ where: { id: { in: [ownerId, staffId] } } });
    await prisma.client.$disconnect();
  });

  it("allows removing a non-owner member", async () => {
    await expect(memberships.remove(orgId, staffId)).resolves.toBeUndefined();
  });

  it("refuses to remove the last owner", async () => {
    await expect(memberships.remove(orgId, ownerId)).rejects.toThrow(/last owner/);
  });
});
