import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Response } from "express";
import { Throttle } from "@nestjs/throttler";
import { z } from "zod";
import { JwtAuthGuard } from "../iam";
import { TenantGuard, type TenantRequest } from "../organizations";
import { NotFoundError } from "../../platform/errors";
import { PrismaService } from "../../platform/prisma.service";
import { RealtimeService } from "../../platform/realtime.service";
import { ZodValidationPipe } from "../../platform/zod-pipe";
import { BookingsService } from "./bookings.service";

const createBookingSchema = z.object({
  staffMemberId: z.string().uuid(),
  serviceId: z.string().uuid(),
  clientEmail: z.string().email(),
  clientName: z.string().optional(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  clientTimeZone: z.string().min(1),
  idempotencyKey: z.string().min(1),
});

const rescheduleSchema = z.object({ startsAt: z.string().datetime() });

/**
 * Guest booking — no session exists here, matching the public funnel
 * (handbook Ch. 6.1). The tenant is resolved from the URL slug alone,
 * which is the security boundary for this path.
 */
@Controller("organizations/:slug/bookings")
export class BookingsController {
  constructor(
    private readonly bookings: BookingsService,
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
  ) {}

  /**
   * Held open for as long as the dashboard is on screen. Authenticated with
   * a bearer token like every other endpoint, so the client reads it with
   * fetch rather than EventSource — EventSource can't set headers, and the
   * alternative is a token in the query string, which lands in access logs.
   */
  @Get("stream")
  @UseGuards(JwtAuthGuard, TenantGuard)
  stream(@Req() req: TenantRequest, @Res() res: Response) {
    const unsubscribe = this.realtime.subscribe(req.organizationId, res);
    req.on("close", unsubscribe);
  }

  // Tighter than the global limit: creating a booking writes, sends mail
  // and pushes to every open dashboard, and one link going around means a
  // cold free-tier instance meets a crowd.
  @Throttle({ burst: { ttl: 60_000, limit: 10 } })
  @Post()
  async create(
    @Param("slug") slug: string,
    @Body(new ZodValidationPipe(createBookingSchema)) body: z.infer<typeof createBookingSchema>,
  ) {
    const organization = await this.prisma.client.organization.findUnique({ where: { slug } });
    if (!organization) throw new NotFoundError(`No organization with slug "${slug}"`);

    return this.bookings.create({
      organizationId: organization.id,
      staffMemberId: body.staffMemberId,
      serviceId: body.serviceId,
      clientEmail: body.clientEmail,
      ...(body.clientName !== undefined && { clientName: body.clientName }),
      startsAt: new Date(body.startsAt),
      endsAt: new Date(body.endsAt),
      clientTimeZone: body.clientTimeZone,
      idempotencyKey: body.idempotencyKey,
      actor: `client:${body.clientEmail}`,
    });
  }

  @Get()
  @UseGuards(JwtAuthGuard, TenantGuard)
  list(@Req() req: TenantRequest, @Query("cursor") cursor?: string) {
    return this.prisma.client.booking.findMany({
      where: { organizationId: req.organizationId },
      orderBy: { startsAt: "desc" },
      take: 100,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      include: {
        client: { select: { email: true, name: true } },
        service: { select: { name: true } },
        staffMember: { select: { displayName: true } },
      },
    });
  }

  @Post(":bookingId/cancel")
  @UseGuards(JwtAuthGuard, TenantGuard)
  @HttpCode(200)
  async cancel(@Req() req: TenantRequest, @Param("bookingId") bookingId: string) {
    await this.assertInOrg(req.organizationId, bookingId);
    return this.bookings.cancel(bookingId, req.userId);
  }

  @Post(":bookingId/complete")
  @UseGuards(JwtAuthGuard, TenantGuard)
  @HttpCode(200)
  async complete(@Req() req: TenantRequest, @Param("bookingId") bookingId: string) {
    await this.assertInOrg(req.organizationId, bookingId);
    return this.bookings.close(bookingId, "COMPLETED", req.userId);
  }

  @Post(":bookingId/no-show")
  @UseGuards(JwtAuthGuard, TenantGuard)
  @HttpCode(200)
  async noShow(@Req() req: TenantRequest, @Param("bookingId") bookingId: string) {
    await this.assertInOrg(req.organizationId, bookingId);
    return this.bookings.close(bookingId, "NO_SHOW", req.userId);
  }

  @Post(":bookingId/reschedule")
  @UseGuards(JwtAuthGuard, TenantGuard)
  @HttpCode(200)
  async reschedule(
    @Req() req: TenantRequest,
    @Param("bookingId") bookingId: string,
    @Body(new ZodValidationPipe(rescheduleSchema)) body: z.infer<typeof rescheduleSchema>,
  ) {
    const booking = await this.assertInOrg(req.organizationId, bookingId);
    const service = await this.prisma.client.service.findUnique({
      where: { id: booking.serviceId },
      select: { durationMin: true },
    });
    const startsAt = new Date(body.startsAt);
    const endsAt = new Date(startsAt.getTime() + (service?.durationMin ?? 30) * 60_000);
    return this.bookings.reschedule(bookingId, startsAt, endsAt, req.userId);
  }

  private async assertInOrg(organizationId: string, bookingId: string) {
    const booking = await this.prisma.client.booking.findFirst({
      where: { id: bookingId, organizationId },
    });
    if (!booking) throw new NotFoundError("Booking not found");
    return booking;
  }
}
