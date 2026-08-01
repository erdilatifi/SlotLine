import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query } from "@nestjs/common";
import { z } from "zod";
import { NotFoundError } from "../../platform/errors";
import { PrismaService } from "../../platform/prisma.service";
import { ZodValidationPipe } from "../../platform/zod-pipe";
import { AvailabilityService } from "./availability.service";
import { HoldsService } from "./holds.service";

const availabilityQuerySchema = z.object({
  serviceId: z.string().uuid(),
  staffMemberId: z.string().uuid(),
});
const createHoldSchema = z.object({
  staffMemberId: z.string().uuid(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
});

/** Fully public — this is the guest booking page, no session exists here. */
@Controller("organizations/:slug")
export class SchedulingController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly availability: AvailabilityService,
    private readonly holds: HoldsService,
  ) {}

  private async resolveOrgId(slug: string): Promise<string> {
    const org = await this.prisma.client.organization.findUnique({ where: { slug } });
    if (!org) throw new NotFoundError(`No organization with slug "${slug}"`);
    return org.id;
  }

  @Get("services")
  async listServices(@Param("slug") slug: string) {
    const organizationId = await this.resolveOrgId(slug);
    return this.prisma.client.service.findMany({
      where: { organizationId, isActive: true },
      select: { id: true, name: true, durationMin: true, priceMinor: true, currency: true },
    });
  }

  @Get("staff")
  async listStaff(@Param("slug") slug: string) {
    const organizationId = await this.resolveOrgId(slug);
    return this.prisma.client.staffMember.findMany({
      where: { organizationId, isBookable: true },
      select: { id: true, displayName: true, timeZone: true },
    });
  }

  @Get("availability")
  async getAvailability(
    @Param("slug") slug: string,
    @Query(new ZodValidationPipe(availabilityQuerySchema))
    query: z.infer<typeof availabilityQuerySchema>,
  ) {
    const organizationId = await this.resolveOrgId(slug);
    return this.availability.forService(
      organizationId,
      query.serviceId,
      query.staffMemberId,
      Date.now(),
    );
  }

  @Post("holds")
  async createHold(
    @Param("slug") slug: string,
    @Body(new ZodValidationPipe(createHoldSchema)) body: z.infer<typeof createHoldSchema>,
  ) {
    await this.resolveOrgId(slug);
    const hold = await this.holds.create(
      body.staffMemberId,
      new Date(body.startsAt),
      new Date(body.endsAt),
    );
    return { holdId: hold.id, expiresAt: hold.expiresAt };
  }

  /**
   * Public like the rest of the funnel — there's no session here. The id is
   * a v7 UUID handed only to whoever created the hold, and the worst a
   * guessed one could do is free a slot five minutes early.
   */
  @Delete("holds/:holdId")
  @HttpCode(204)
  async releaseHold(@Param("slug") slug: string, @Param("holdId") holdId: string) {
    await this.resolveOrgId(slug);
    await this.holds.release(holdId);
  }
}
