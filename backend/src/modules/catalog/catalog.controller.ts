import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Req,
  UseGuards,
} from "@nestjs/common";
import { z } from "zod";
import { JwtAuthGuard } from "../iam";
import { hasRole, TenantGuard, type TenantRequest } from "../organizations";
import { ForbiddenError, NotFoundError, ValidationError } from "../../platform/errors";
import { PrismaService } from "../../platform/prisma.service";
import { ZodValidationPipe } from "../../platform/zod-pipe";

const serviceFields = {
  name: z.string().min(1),
  durationMin: z.number().int().positive(),
  priceMinor: z.number().int().nonnegative(),
  currency: z.string().length(3),
  bufferBeforeMin: z.number().int().nonnegative(),
  bufferAfterMin: z.number().int().nonnegative(),
  isActive: z.boolean(),
};

const createServiceSchema = z.object({
  name: serviceFields.name,
  durationMin: serviceFields.durationMin,
  priceMinor: serviceFields.priceMinor.default(0),
  currency: serviceFields.currency.default("USD"),
  bufferBeforeMin: serviceFields.bufferBeforeMin.default(0),
  bufferAfterMin: serviceFields.bufferAfterMin.default(0),
});

const updateServiceSchema = z.object(serviceFields).partial();

const createStaffSchema = z.object({
  displayName: z.string().min(1),
  timeZone: z.string().min(1),
});

const updateStaffSchema = z
  .object({
    displayName: z.string().min(1),
    timeZone: z.string().min(1),
    isBookable: z.boolean(),
  })
  .partial();

const weeklyHoursSchema = z.object({
  rules: z.array(
    z.object({
      weekday: z.number().int().min(0).max(6),
      startHour: z.number().int().min(0).max(23),
      startMinute: z.number().int().min(0).max(59),
      endHour: z.number().int().min(0).max(23),
      endMinute: z.number().int().min(0).max(59),
    }),
  ),
});

const timeOffSchema = z.object({
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  reason: z.string().max(200).optional(),
});

/**
 * Zod's `.partial()` produces `key?: T | undefined`, which Prisma won't
 * accept under `exactOptionalPropertyTypes` — an explicit undefined is not
 * the same as an absent key. Dropping the absent ones is the honest fix.
 */
type Defined<T> = { [K in keyof T]?: Exclude<T[K], undefined> };

function definedOnly<T extends object>(body: T): Defined<T> {
  return Object.fromEntries(
    Object.entries(body).filter(([, value]) => value !== undefined),
  ) as Defined<T>;
}

@Controller("organizations/:slug")
@UseGuards(JwtAuthGuard, TenantGuard)
export class CatalogController {
  constructor(private readonly prisma: PrismaService) {}

  private requireAdmin(req: TenantRequest): void {
    if (!hasRole(req.role, "ADMIN")) {
      throw new ForbiddenError("Only owners and admins can manage the catalog");
    }
  }

  /**
   * Everything the dashboard renders, in one round trip. It used to make
   * one request per resource plus one per staff member for their hours,
   * which on a five-person team is eight requests before anything appears.
   */
  @Get("dashboard")
  async dashboard(@Req() req: TenantRequest) {
    const organizationId = req.organizationId;
    const [services, staff, bookings, rules, timeOff, organization, members] = await Promise.all([
      this.prisma.client.service.findMany({ where: { organizationId }, orderBy: { name: "asc" } }),
      this.prisma.client.staffMember.findMany({
        where: { organizationId },
        orderBy: { displayName: "asc" },
      }),
      this.prisma.client.booking.findMany({
        where: { organizationId },
        orderBy: { startsAt: "desc" },
        take: 100,
        include: {
          client: { select: { email: true, name: true } },
          service: { select: { name: true } },
          staffMember: { select: { displayName: true } },
        },
      }),
      this.prisma.client.scheduleRule.findMany({
        where: { staffMember: { organizationId } },
        orderBy: [{ weekday: "asc" }, { startHour: "asc" }],
      }),
      this.prisma.client.timeOff.findMany({
        where: { staffMember: { organizationId }, endsAt: { gte: new Date() } },
        orderBy: { startsAt: "asc" },
      }),
      this.prisma.client.organization.findUnique({
        where: { id: organizationId },
        select: {
          slug: true,
          name: true,
          timeZone: true,
          minNoticeMinutes: true,
          bookingHorizonDays: true,
        },
      }),
      this.prisma.client.membership.findMany({
        where: { organizationId },
        include: { user: { select: { id: true, email: true } } },
      }),
    ]);

    return {
      services,
      staff,
      bookings,
      rules,
      timeOff,
      organization,
      members: members.map((m) => ({ userId: m.user.id, email: m.user.email, role: m.role })),
      role: req.role,
    };
  }

  @Post("services")
  @HttpCode(201)
  createService(
    @Req() req: TenantRequest,
    @Body(new ZodValidationPipe(createServiceSchema)) body: z.infer<typeof createServiceSchema>,
  ) {
    this.requireAdmin(req);
    return this.prisma.client.service.create({
      data: { organizationId: req.organizationId, ...body },
    });
  }

  @Patch("services/:serviceId")
  async updateService(
    @Req() req: TenantRequest,
    @Param("serviceId") serviceId: string,
    @Body(new ZodValidationPipe(updateServiceSchema)) body: z.infer<typeof updateServiceSchema>,
  ) {
    this.requireAdmin(req);
    const existing = await this.prisma.client.service.findFirst({
      where: { id: serviceId, organizationId: req.organizationId },
    });
    if (!existing) throw new NotFoundError("Service not found");
    return this.prisma.client.service.update({ where: { id: serviceId }, data: definedOnly(body) });
  }

  /**
   * Deleting a service cascades to its bookings, which would erase history
   * someone still needs. So a service that has ever been booked is retired
   * instead — it stops being offered and everything it produced survives.
   */
  @Delete("services/:serviceId")
  async deleteService(@Req() req: TenantRequest, @Param("serviceId") serviceId: string) {
    this.requireAdmin(req);
    const existing = await this.prisma.client.service.findFirst({
      where: { id: serviceId, organizationId: req.organizationId },
    });
    if (!existing) throw new NotFoundError("Service not found");

    const bookings = await this.prisma.client.booking.count({ where: { serviceId } });
    if (bookings > 0) {
      await this.prisma.client.service.update({
        where: { id: serviceId },
        data: { isActive: false },
      });
      return { outcome: "retired" as const };
    }

    await this.prisma.client.service.delete({ where: { id: serviceId } });
    return { outcome: "deleted" as const };
  }

  @Post("staff")
  @HttpCode(201)
  createStaff(
    @Req() req: TenantRequest,
    @Body(new ZodValidationPipe(createStaffSchema)) body: z.infer<typeof createStaffSchema>,
  ) {
    this.requireAdmin(req);
    return this.prisma.client.staffMember.create({
      data: { organizationId: req.organizationId, ...body },
    });
  }

  @Patch("staff/:staffMemberId")
  async updateStaff(
    @Req() req: TenantRequest,
    @Param("staffMemberId") staffMemberId: string,
    @Body(new ZodValidationPipe(updateStaffSchema)) body: z.infer<typeof updateStaffSchema>,
  ) {
    this.requireAdmin(req);
    await this.assertStaffInOrg(req.organizationId, staffMemberId);
    return this.prisma.client.staffMember.update({
      where: { id: staffMemberId },
      data: definedOnly(body),
    });
  }

  @Delete("staff/:staffMemberId")
  async deleteStaff(@Req() req: TenantRequest, @Param("staffMemberId") staffMemberId: string) {
    this.requireAdmin(req);
    await this.assertStaffInOrg(req.organizationId, staffMemberId);

    const bookings = await this.prisma.client.booking.count({ where: { staffMemberId } });
    if (bookings > 0) {
      await this.prisma.client.staffMember.update({
        where: { id: staffMemberId },
        data: { isBookable: false },
      });
      return { outcome: "retired" as const };
    }

    await this.prisma.client.staffMember.delete({ where: { id: staffMemberId } });
    return { outcome: "deleted" as const };
  }

  @Get("staff/:staffMemberId/hours")
  async getHours(@Req() req: TenantRequest, @Param("staffMemberId") staffMemberId: string) {
    await this.assertStaffInOrg(req.organizationId, staffMemberId);
    return this.prisma.client.scheduleRule.findMany({
      where: { staffMemberId },
      orderBy: [{ weekday: "asc" }, { startHour: "asc" }],
    });
  }

  /** Replaces the staff member's whole weekly schedule in one write. */
  @Put("staff/:staffMemberId/hours")
  async setHours(
    @Req() req: TenantRequest,
    @Param("staffMemberId") staffMemberId: string,
    @Body(new ZodValidationPipe(weeklyHoursSchema)) body: z.infer<typeof weeklyHoursSchema>,
  ) {
    this.requireAdmin(req);
    await this.assertStaffInOrg(req.organizationId, staffMemberId);

    await this.prisma.client.$transaction([
      this.prisma.client.scheduleRule.deleteMany({ where: { staffMemberId } }),
      this.prisma.client.scheduleRule.createMany({
        data: body.rules.map((rule) => ({ staffMemberId, ...rule })),
      }),
    ]);
    return { message: "Hours updated" };
  }

  @Get("staff/:staffMemberId/time-off")
  async listTimeOff(@Req() req: TenantRequest, @Param("staffMemberId") staffMemberId: string) {
    await this.assertStaffInOrg(req.organizationId, staffMemberId);
    return this.prisma.client.timeOff.findMany({
      where: { staffMemberId, endsAt: { gte: new Date() } },
      orderBy: { startsAt: "asc" },
    });
  }

  @Post("staff/:staffMemberId/time-off")
  @HttpCode(201)
  async createTimeOff(
    @Req() req: TenantRequest,
    @Param("staffMemberId") staffMemberId: string,
    @Body(new ZodValidationPipe(timeOffSchema)) body: z.infer<typeof timeOffSchema>,
  ) {
    this.requireAdmin(req);
    await this.assertStaffInOrg(req.organizationId, staffMemberId);

    const startsAt = new Date(body.startsAt);
    const endsAt = new Date(body.endsAt);
    if (endsAt <= startsAt) throw new ValidationError("Time off has to end after it starts");

    return this.prisma.client.timeOff.create({
      data: { staffMemberId, startsAt, endsAt, reason: body.reason ?? null },
    });
  }

  @Delete("staff/:staffMemberId/time-off/:timeOffId")
  async deleteTimeOff(
    @Req() req: TenantRequest,
    @Param("staffMemberId") staffMemberId: string,
    @Param("timeOffId") timeOffId: string,
  ) {
    this.requireAdmin(req);
    await this.assertStaffInOrg(req.organizationId, staffMemberId);
    const existing = await this.prisma.client.timeOff.findFirst({
      where: { id: timeOffId, staffMemberId },
    });
    if (!existing) throw new NotFoundError("Time off not found");
    await this.prisma.client.timeOff.delete({ where: { id: timeOffId } });
    return { message: "Time off removed" };
  }

  private async assertStaffInOrg(organizationId: string, staffMemberId: string): Promise<void> {
    const staff = await this.prisma.client.staffMember.findFirst({
      where: { id: staffMemberId, organizationId },
    });
    if (!staff) throw new NotFoundError("Staff member not found");
  }
}
