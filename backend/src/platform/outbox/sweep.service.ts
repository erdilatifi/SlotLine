import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma.service";

/** Arbitrary but stable key so every replica competes for the same lock. */
const SWEEP_LOCK_KEY = 4815162342n;

const REMINDER_EVENT = "booking.reminder";
/** Far enough ahead that someone can still rearrange their day. */
const REMINDER_LEAD_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class SweepService {
  private readonly logger = new Logger(SweepService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Housekeeping that must run once across all worker replicas, not once
   * per replica. `pg_try_advisory_lock` is the legitimate use of a
   * distributed lock: the worst case of losing it is skipped work, not a
   * violated invariant (contrast with the booking exclusion constraint,
   * where a lock would be the wrong tool entirely).
   */
  async run(): Promise<void> {
    const [{ locked }] = await this.prisma.client.$queryRaw<[{ locked: boolean }]>`
      SELECT pg_try_advisory_lock(${SWEEP_LOCK_KEY}::bigint) AS locked
    `;
    if (!locked) return;

    try {
      // Expired holds are already ignored by every read (they filter on
      // expiresAt), so this is purely to keep the table small — if this
      // sweep never ran, nothing would break.
      const holds = await this.prisma.client.hold.deleteMany({
        where: { expiresAt: { lt: new Date() } },
      });

      // Time moving forward is itself a transition trigger (handbook Ch. 9.3).
      const completed = await this.prisma.client.booking.updateMany({
        where: { status: "CONFIRMED", endsAt: { lt: new Date() } },
        data: { status: "COMPLETED" },
      });

      const reminders = await this.queueReminders();

      if (holds.count || completed.count || reminders) {
        this.logger.log(
          `Swept ${holds.count} expired holds, completed ${completed.count} bookings, ` +
            `queued ${reminders} reminders`,
        );
      }
    } finally {
      await this.prisma.client.$queryRaw`SELECT pg_advisory_unlock(${SWEEP_LOCK_KEY}::bigint)`;
    }
  }

  /**
   * Writes one reminder event per booking starting within the next day.
   * Queueing is deliberately separate from sending: this decides *that* a
   * reminder is owed, the outbox consumer decides when it actually goes,
   * and the delivery row stops a redelivery becoming a second email.
   *
   * A booking that already has an event is skipped, so running this every
   * minute for 24 hours still produces exactly one reminder.
   */
  private async queueReminders(): Promise<number> {
    const now = new Date();
    const horizon = new Date(now.getTime() + REMINDER_LEAD_MS);

    const due = await this.prisma.client.booking.findMany({
      where: { status: "CONFIRMED", startsAt: { gte: now, lte: horizon } },
      select: { id: true },
    });
    if (due.length === 0) return 0;

    const alreadyQueued = await this.prisma.client.outboxEvent.findMany({
      where: { type: REMINDER_EVENT, aggregateId: { in: due.map((b) => b.id) } },
      select: { aggregateId: true },
    });
    const seen = new Set(alreadyQueued.map((event) => event.aggregateId));
    const pending = due.filter((booking) => !seen.has(booking.id));
    if (pending.length === 0) return 0;

    const { count } = await this.prisma.client.outboxEvent.createMany({
      data: pending.map((booking) => ({
        type: REMINDER_EVENT,
        aggregateId: booking.id,
        payload: { bookingId: booking.id },
      })),
    });
    return count;
  }
}
