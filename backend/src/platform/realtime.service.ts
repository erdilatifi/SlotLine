import { Injectable, Logger } from "@nestjs/common";
import type { Response } from "express";

export interface RealtimeEvent {
  type: "booking.created" | "booking.cancelled";
  bookingId: string;
}

/**
 * Server-sent events, held in process.
 *
 * One API instance is the deployment (ADR-0002 rules out anything that
 * costs money to scale out), so a Map of open responses is the whole
 * mechanism — no broker, no Redis. If this ever runs on two instances,
 * subscribers on the other one stop hearing updates and this needs to move
 * to Postgres LISTEN/NOTIFY.
 */
@Injectable()
export class RealtimeService {
  private readonly logger = new Logger(RealtimeService.name);
  private readonly subscribers = new Map<string, Set<Response>>();

  subscribe(organizationId: string, res: Response): () => void {
    res.set({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Nginx and similar buffer by default, which holds events until the
      // response ends — i.e. forever, for a stream.
      "X-Accel-Buffering": "no",
    });
    res.flushHeaders();
    res.write(": connected\n\n");

    const forOrg = this.subscribers.get(organizationId) ?? new Set<Response>();
    forOrg.add(res);
    this.subscribers.set(organizationId, forOrg);

    // Proxies and load balancers drop an idle connection; a comment line
    // every 25s keeps it open without being an event.
    const keepAlive = setInterval(() => res.write(": keep-alive\n\n"), 25_000);

    return () => {
      clearInterval(keepAlive);
      forOrg.delete(res);
      if (forOrg.size === 0) this.subscribers.delete(organizationId);
    };
  }

  publish(organizationId: string, event: RealtimeEvent): void {
    const forOrg = this.subscribers.get(organizationId);
    if (!forOrg?.size) return;

    const frame = `data: ${JSON.stringify(event)}\n\n`;
    for (const res of forOrg) {
      try {
        res.write(frame);
      } catch {
        // A dead socket isn't worth failing the write path that triggered
        // this — the close handler will clean it up.
        forOrg.delete(res);
      }
    }
    this.logger.debug(`Published ${event.type} to ${forOrg.size} subscriber(s)`);
  }
}
