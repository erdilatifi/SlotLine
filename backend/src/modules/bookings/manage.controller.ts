import { Body, Controller, Get, HttpCode, Param, Post } from "@nestjs/common";
import { z } from "zod";
import { NotFoundError, ValidationError } from "../../platform/errors";
import { PrismaService } from "../../platform/prisma.service";
import { ZodValidationPipe } from "../../platform/zod-pipe";
import { AvailabilityService } from "../scheduling";
import { BookingsService } from "./bookings.service";

const rescheduleSchema = z.object({
  startsAt: z.string().datetime(),
});

/**
 * Guest self-service, authorised by the token in the URL and nothing else.
 *
 * There is no session here and no account — holding the link is the whole
 * permission, and it grants exactly one booking. That is the point: a
 * client who needs to move an appointment shouldn't have to phone, and
 * shouldn't have to sign up either (handbook Ch. 6.1).
 */
@Controller("appointments/:token")
export class ManageBookingController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bookings: BookingsService,
    private readonly availability: AvailabilityService,
  ) {}

  @Get()
  async show(@Param("token") token: string) {
    const booking = await this.load(token);
    return {
      id: booking.id,
      startsAt: booking.startsAt,
      endsAt: booking.endsAt,
      status: booking.status,
      clientTimeZone: booking.clientTimeZone,
      serviceName: booking.service.name,
      durationMin: booking.service.durationMin,
      staffName: booking.staffMember.displayName,
      organizationName: booking.organization.name,
      organizationSlug: booking.organization.slug,
      clientName: booking.client.name,
    };
  }

  /** The times this booking could move to, on the same staff member. */
  @Get("options")
  async options(@Param("token") token: string) {
    const booking = await this.load(token);
    const result = await this.availability.forService(
      booking.organizationId,
      booking.serviceId,
      booking.staffMemberId,
      Date.now(),
    );
    return { ...result, durationMin: booking.service.durationMin };
  }

  @Post("cancel")
  @HttpCode(200)
  async cancel(@Param("token") token: string) {
    const booking = await this.load(token);
    await this.bookings.cancel(booking.id, `client:${booking.client.email}`);
    return { message: "Cancelled" };
  }

  @Post("reschedule")
  @HttpCode(200)
  async reschedule(
    @Param("token") token: string,
    @Body(new ZodValidationPipe(rescheduleSchema)) body: z.infer<typeof rescheduleSchema>,
  ) {
    const booking = await this.load(token);
    const startsAt = new Date(body.startsAt);
    if (startsAt.getTime() <= Date.now()) {
      throw new ValidationError("Pick a time in the future");
    }
    const endsAt = new Date(startsAt.getTime() + booking.service.durationMin * 60_000);

    const replacement = await this.bookings.reschedule(
      booking.id,
      startsAt,
      endsAt,
      `client:${booking.client.email}`,
    );
    // The new booking carries its own token — the old link is spent, and
    // the client needs the one that works from here on.
    return { manageToken: replacement.manageToken, startsAt: replacement.startsAt };
  }

  private async load(token: string) {
    const booking = await this.prisma.client.booking.findUnique({
      where: { manageToken: token },
      include: { client: true, service: true, staffMember: true, organization: true },
    });
    // Same error whether the token is wrong or the booking is gone — a
    // different response would confirm which tokens exist.
    if (!booking) throw new NotFoundError("This link is no longer valid");
    return booking;
  }
}
