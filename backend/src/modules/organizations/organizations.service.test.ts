import "../../config/load-dotenv";
import { describe, expect, it } from "vitest";
import { ConfigService } from "../../config/config.service";
import { PrismaService } from "../../platform/prisma.service";
import { OrganizationsService } from "./organizations.service";

describe("OrganizationsService (against the real database)", () => {
  const prisma = new PrismaService(new ConfigService());
  const service = new OrganizationsService(prisma);

  it("finds the seeded organization by slug", async () => {
    const result = await service.findBySlug("riverside-barbers");
    expect(result).toEqual({
      slug: "riverside-barbers",
      name: "Riverside Barbers",
      timeZone: "Europe/Belgrade",
    });
  });

  it("throws NotFoundError for an unknown slug", async () => {
    await expect(service.findBySlug("does-not-exist")).rejects.toThrow(/No organization/);
  });
});
