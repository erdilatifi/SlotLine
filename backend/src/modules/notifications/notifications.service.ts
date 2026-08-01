import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "../../config/config.service";
import { EmailService } from "../../platform/email.service";
import { PrismaService } from "../../platform/prisma.service";

type BookingKind = "confirmed" | "cancelled" | "reminder";

/**
 * Reacts to outbox events only — never called from the booking write path,
 * which is what keeps a slow or broken email provider from being able to
 * fail a booking (handbook Ch. 3.3).
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly frontendUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    config: ConfigService,
  ) {
    this.frontendUrl = config.env.FRONTEND_URL;
  }

  /**
   * The job carries a booking id, not a rendered message — it re-reads
   * current state at execution time, so an event about a booking that has
   * since changed or vanished resolves correctly instead of acting on a
   * stale decision (handbook Ch. 10.3).
   */
  async handleBookingEvent(bookingId: string, eventId: string, kind: BookingKind) {
    const booking = await this.prisma.client.booking.findUnique({
      where: { id: bookingId },
      include: { client: true, service: true, staffMember: true, organization: true },
    });
    if (!booking) {
      this.logger.log(`Booking ${bookingId} no longer exists — nothing to send`);
      return;
    }

    // A reminder for something already cancelled is worse than no reminder.
    if (kind === "reminder" && booking.status !== "CONFIRMED") {
      this.logger.log(`Booking ${bookingId} is ${booking.status} — skipping reminder`);
      return;
    }

    const when = new Intl.DateTimeFormat("en-GB", {
      weekday: "long",
      day: "numeric",
      month: "long",
      hour: "numeric",
      minute: "2-digit",
      timeZone: booking.clientTimeZone,
    }).format(booking.startsAt);

    const { subject, body } = this.render(kind, {
      when,
      zone: booking.clientTimeZone,
      clientName: booking.client.name,
      orgName: booking.organization.name,
      serviceName: booking.service.name,
      staffName: booking.staffMember.displayName,
      manageUrl: booking.manageToken
        ? `${this.frontendUrl}/appointment/${booking.manageToken}`
        : null,
    });

    // Claiming the row first is what makes a redelivery a no-op rather than
    // a second email — unique on (eventId, recipient), invariant I5.
    try {
      await this.prisma.client.emailDelivery.create({
        data: { eventId, recipient: booking.client.email, subject },
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        this.logger.log(`Already delivered event ${eventId} to ${booking.client.email}`);
        return;
      }
      throw err;
    }

    try {
      await this.email.send({ to: booking.client.email, subject, body });
    } catch (err) {
      // Release the claim so the outbox's retry can genuinely try again.
      // Without this a transient provider error would look like a completed
      // delivery forever, which is the "silently lost" half of I5.
      await this.prisma.client.emailDelivery
        .deleteMany({ where: { eventId, recipient: booking.client.email } })
        .catch(() => undefined);
      throw err;
    }
  }

  private render(
    kind: BookingKind,
    ctx: {
      when: string;
      zone: string;
      clientName: string | null;
      orgName: string;
      serviceName: string;
      staffName: string;
      manageUrl: string | null;
    },
  ): { subject: string; body: string } {
    const greeting = ctx.clientName ? `Hi ${ctx.clientName},` : "Hi,";
    const manage = ctx.manageUrl
      ? `\n\nNeed to change or cancel it? Use this link:\n${ctx.manageUrl}`
      : "";

    if (kind === "cancelled") {
      return {
        subject: `Your ${ctx.serviceName} at ${ctx.orgName} was cancelled`,
        body:
          `${greeting}\n\n` +
          `Your ${ctx.serviceName} with ${ctx.staffName} on ${ctx.when} ` +
          `(${ctx.zone}) has been cancelled.\n\n` +
          `If this wasn't you, get in touch with ${ctx.orgName}.\n\n— ${ctx.orgName}`,
      };
    }

    if (kind === "reminder") {
      return {
        subject: `Tomorrow: ${ctx.serviceName} at ${ctx.orgName}`,
        body:
          `${greeting}\n\n` +
          `A reminder that you're booked in for ${ctx.serviceName} with ${ctx.staffName} ` +
          `on ${ctx.when} (${ctx.zone}).${manage}\n\n— ${ctx.orgName}`,
      };
    }

    return {
      subject: `Your ${ctx.serviceName} at ${ctx.orgName} is confirmed`,
      body:
        `${greeting}\n\n` +
        `You're booked in for ${ctx.serviceName} with ${ctx.staffName} ` +
        `on ${ctx.when} (${ctx.zone}).${manage}\n\n— ${ctx.orgName}`,
    };
  }
}

function isUniqueViolation(err: unknown): boolean {
  const cause = (err as { meta?: { driverAdapterError?: { cause?: { code?: string } } } })?.meta
    ?.driverAdapterError?.cause;
  return cause?.code === "23505" || (err as { code?: string })?.code === "P2002";
}
