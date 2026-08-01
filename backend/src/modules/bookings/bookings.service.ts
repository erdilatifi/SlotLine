import { Injectable } from "@nestjs/common";
import { randomBytes } from "node:crypto";
import { ConflictError, isExclusionViolation, NotFoundError } from "../../platform/errors";
import { PrismaService } from "../../platform/prisma.service";
import { RealtimeService } from "../../platform/realtime.service";
import { canTransition } from "./state-machine";

interface CreateBookingInput {
  organizationId: string;
  staffMemberId: string;
  serviceId: string;
  clientEmail: string;
  clientName?: string;
  startsAt: Date;
  endsAt: Date;
  clientTimeZone: string;
  idempotencyKey: string;
  actor: string;
}

@Injectable()
export class BookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
  ) {}

  async create(input: CreateBookingInput) {
    const existing = await this.prisma.client.booking.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (existing) return existing;

    const client = await this.prisma.client.client.upsert({
      where: {
        organizationId_email: { organizationId: input.organizationId, email: input.clientEmail },
      },
      update: {},
      create: {
        organizationId: input.organizationId,
        email: input.clientEmail,
        ...(input.clientName !== undefined && { name: input.clientName }),
      },
    });

    try {
      const booking = await this.prisma.client.$transaction(async (tx) => {
        const booking = await tx.booking.create({
          data: {
            organizationId: input.organizationId,
            staffMemberId: input.staffMemberId,
            serviceId: input.serviceId,
            clientId: client.id,
            startsAt: input.startsAt,
            endsAt: input.endsAt,
            clientTimeZone: input.clientTimeZone,
            idempotencyKey: input.idempotencyKey,
            status: "CONFIRMED",
            // 32 bytes of entropy: this token is the only thing standing
            // between a stranger and cancelling someone's appointment, so
            // it has to be as unguessable as a session token even though
            // it travels in an email.
            manageToken: randomBytes(32).toString("base64url"),
          },
        });
        await tx.auditLog.create({
          data: {
            organizationId: input.organizationId,
            actor: input.actor,
            action: "booking.created",
            entity: booking.id,
          },
        });
        // Same transaction as the booking itself — the event is exactly as
        // durable as the fact it describes (invariant I5).
        await tx.outboxEvent.create({
          data: {
            type: "booking.confirmed",
            aggregateId: booking.id,
            payload: { bookingId: booking.id },
          },
        });
        return booking;
      });

      // After commit, never inside it — a rolled-back transaction that had
      // already announced the booking would leave every open dashboard
      // showing one that doesn't exist.
      this.realtime.publish(input.organizationId, {
        type: "booking.created",
        bookingId: booking.id,
      });
      return booking;
    } catch (err) {
      if (isExclusionViolation(err)) throw new ConflictError("That time is no longer available");
      throw err;
    }
  }

  async cancel(bookingId: string, actor: string) {
    const booking = await this.prisma.client.booking.findUnique({ where: { id: bookingId } });
    if (!booking) throw new NotFoundError("Booking not found");
    if (!canTransition(booking.status, "CANCELLED")) {
      throw new ConflictError(`Cannot cancel a booking in status ${booking.status}`);
    }

    const updated = await this.prisma.client.$transaction(async (tx) => {
      const cancelled = await tx.booking.update({
        where: { id: bookingId },
        data: { status: "CANCELLED" },
      });
      await tx.auditLog.create({
        data: {
          organizationId: booking.organizationId,
          actor,
          action: "booking.cancelled",
          entity: bookingId,
        },
      });
      await tx.outboxEvent.create({
        data: {
          type: "booking.cancelled",
          aggregateId: bookingId,
          payload: { bookingId },
        },
      });
      return cancelled;
    });

    this.realtime.publish(booking.organizationId, { type: "booking.cancelled", bookingId });
    return updated;
  }

  /**
   * Closes a booking out after the fact — who turned up and who didn't.
   * No-show data is the only way an owner can ever see a pattern, so it
   * has to be recordable rather than inferred.
   */
  async close(bookingId: string, to: "COMPLETED" | "NO_SHOW", actor: string) {
    const booking = await this.prisma.client.booking.findUnique({ where: { id: bookingId } });
    if (!booking) throw new NotFoundError("Booking not found");
    if (!canTransition(booking.status, to)) {
      throw new ConflictError(`Cannot mark a booking in status ${booking.status} as ${to}`);
    }

    return this.prisma.client.$transaction(async (tx) => {
      const updated = await tx.booking.update({ where: { id: bookingId }, data: { status: to } });
      await tx.auditLog.create({
        data: {
          organizationId: booking.organizationId,
          actor,
          action: `booking.${to.toLowerCase()}`,
          entity: bookingId,
        },
      });
      return updated;
    });
  }

  /**
   * Moves a booking by writing a new one and retiring the old, both in one
   * transaction. The new row goes through the same exclusion constraint as
   * any other booking, so a slot someone else took a second ago is refused
   * here exactly as it would be on the public funnel — and because the old
   * booking is only released inside that same transaction, a failed move
   * can't leave the client with no appointment at all.
   */
  async reschedule(bookingId: string, startsAt: Date, endsAt: Date, actor: string) {
    const booking = await this.prisma.client.booking.findUnique({ where: { id: bookingId } });
    if (!booking) throw new NotFoundError("Booking not found");
    if (!canTransition(booking.status, "RESCHEDULED")) {
      throw new ConflictError(`Cannot move a booking in status ${booking.status}`);
    }

    try {
      const created = await this.prisma.client.$transaction(async (tx) => {
        // Freed first, so the new row doesn't collide with the booking it
        // is replacing when a client only shifts by a few minutes.
        await tx.booking.update({
          where: { id: bookingId },
          data: { status: "RESCHEDULED" },
        });

        const replacement = await tx.booking.create({
          data: {
            organizationId: booking.organizationId,
            staffMemberId: booking.staffMemberId,
            serviceId: booking.serviceId,
            clientId: booking.clientId,
            startsAt,
            endsAt,
            clientTimeZone: booking.clientTimeZone,
            idempotencyKey: `reschedule:${bookingId}:${startsAt.toISOString()}`,
            status: "CONFIRMED",
            manageToken: randomBytes(32).toString("base64url"),
          },
        });

        await tx.booking.update({
          where: { id: bookingId },
          data: { rescheduledToId: replacement.id },
        });
        await tx.auditLog.create({
          data: {
            organizationId: booking.organizationId,
            actor,
            action: "booking.rescheduled",
            entity: bookingId,
            diff: {
              from: booking.startsAt.toISOString(),
              to: startsAt.toISOString(),
              replacementId: replacement.id,
            },
          },
        });
        await tx.outboxEvent.create({
          data: {
            type: "booking.confirmed",
            aggregateId: replacement.id,
            payload: { bookingId: replacement.id },
          },
        });
        return replacement;
      });

      this.realtime.publish(booking.organizationId, {
        type: "booking.created",
        bookingId: created.id,
      });
      return created;
    } catch (err) {
      if (isExclusionViolation(err)) throw new ConflictError("That time is no longer available");
      throw err;
    }
  }
}
