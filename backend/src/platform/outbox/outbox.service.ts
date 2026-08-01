import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma.service";

const MAX_ATTEMPTS = 5;
const BATCH_SIZE = 20;

interface ClaimedEvent {
  id: string;
  type: string;
  payload: unknown;
  attempts: number;
}

export type EventHandler = (event: ClaimedEvent) => Promise<void>;

@Injectable()
export class OutboxService {
  private readonly logger = new Logger(OutboxService.name);
  private readonly handlers = new Map<string, EventHandler>();

  constructor(private readonly prisma: PrismaService) {}

  register(type: string, handler: EventHandler): void {
    this.handlers.set(type, handler);
  }

  /**
   * Claims a batch and increments `attempts` in one statement. The
   * `FOR UPDATE SKIP LOCKED` subquery lets several workers claim disjoint
   * batches concurrently; doing the claim as an UPDATE (rather than a
   * SELECT followed by processing) matters because the row locks are
   * released the moment that statement commits — a plain SELECT would let
   * a second worker grab the same rows while the first was still working.
   *
   * Incrementing attempts at claim time also means a worker that crashes
   * mid-handler doesn't retry forever: the attempt is already counted.
   */
  async processBatch(): Promise<number> {
    const events = await this.prisma.client.$queryRaw<ClaimedEvent[]>`
      UPDATE "OutboxEvent"
      SET attempts = attempts + 1
      WHERE id IN (
        SELECT id FROM "OutboxEvent"
        WHERE "processedAt" IS NULL AND "deadAt" IS NULL AND attempts < ${MAX_ATTEMPTS}
        ORDER BY "createdAt"
        LIMIT ${BATCH_SIZE}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id, type, payload, attempts
    `;

    for (const event of events) {
      await this.processOne(event);
    }
    return events.length;
  }

  private async processOne(event: ClaimedEvent): Promise<void> {
    const handler = this.handlers.get(event.type);
    if (!handler) {
      this.logger.warn(`No handler for event type "${event.type}" — dead-lettering`);
      await this.prisma.client.outboxEvent.update({
        where: { id: event.id },
        data: { deadAt: new Date(), lastError: "No handler registered" },
      });
      return;
    }

    try {
      await handler(event);
      await this.prisma.client.outboxEvent.update({
        where: { id: event.id },
        data: { processedAt: new Date() },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const exhausted = event.attempts >= MAX_ATTEMPTS;

      await this.prisma.client.outboxEvent.update({
        where: { id: event.id },
        data: { lastError: message, ...(exhausted && { deadAt: new Date() }) },
      });

      if (exhausted) {
        this.logger.error(
          `Event ${event.id} dead-lettered after ${event.attempts} attempts: ${message}`,
        );
      } else {
        this.logger.warn(`Event ${event.id} failed (attempt ${event.attempts}): ${message}`);
      }
    }
  }

  /** Rows a human needs to look at — the DLQ is an inbox, not a graveyard. */
  countDeadLettered(): Promise<number> {
    return this.prisma.client.outboxEvent.count({ where: { deadAt: { not: null } } });
  }
}
