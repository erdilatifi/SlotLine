import { Module, type OnModuleInit } from "@nestjs/common";
import { OutboxService } from "../../platform/outbox/outbox.service";
import { CalendarModule, CalendarService } from "../calendar";
import { NotificationsService } from "./notifications.service";

/**
 * Both consumers react to events only — neither sits in the booking write
 * path, which is what keeps a slow email provider or an unreachable Google
 * from being able to fail a booking (handbook Ch. 3.3).
 */
@Module({
  imports: [CalendarModule],
  providers: [NotificationsService, OutboxService],
  exports: [OutboxService],
})
export class NotificationsModule implements OnModuleInit {
  constructor(
    private readonly outbox: OutboxService,
    private readonly notifications: NotificationsService,
    private readonly calendar: CalendarService,
  ) {}

  onModuleInit(): void {
    this.outbox.register("booking.confirmed", async (event) => {
      const bookingId = payloadBookingId(event.payload);
      await this.notifications.handleBookingEvent(bookingId, event.id, "confirmed");
      await this.calendar.pushBooking(bookingId);
    });

    this.outbox.register("booking.cancelled", async (event) => {
      const bookingId = payloadBookingId(event.payload);
      await this.notifications.handleBookingEvent(bookingId, event.id, "cancelled");
      await this.calendar.removeBooking(bookingId);
    });

    // Queued by the sweep a day out; the consumer re-reads the booking and
    // stays quiet if it has since been cancelled or moved.
    this.outbox.register("booking.reminder", async (event) => {
      await this.notifications.handleBookingEvent(
        payloadBookingId(event.payload),
        event.id,
        "reminder",
      );
    });
  }
}

function payloadBookingId(payload: unknown): string {
  const bookingId = (payload as { bookingId?: string })?.bookingId;
  if (!bookingId) throw new Error("Event payload is missing bookingId");
  return bookingId;
}
