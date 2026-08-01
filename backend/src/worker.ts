import "reflect-metadata";
import "./config/load-dotenv";
import { NestFactory } from "@nestjs/core";
import { Logger } from "nestjs-pino";
import { OutboxService } from "./platform/outbox/outbox.service";
import { SweepService } from "./platform/outbox/sweep.service";
import { WorkerModule } from "./worker.module";

const IDLE_POLL_MS = 2_000;
const SWEEP_INTERVAL_MS = 60_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(WorkerModule, { bufferLogs: true });
  const logger = app.get(Logger);
  app.useLogger(logger);

  const outbox = app.get(OutboxService);
  const sweep = app.get(SweepService);

  // Deployments send SIGTERM. Finish the batch in flight, then exit — an
  // abandoned batch would be redelivered (attempts is already incremented)
  // but leaves half-finished side effects and confusing logs.
  let running = true;
  for (const signal of ["SIGTERM", "SIGINT"] as const) {
    process.on(signal, () => {
      logger.log(`${signal} received — finishing current batch, then exiting`);
      running = false;
    });
  }

  logger.log("worker started");
  let lastSweep = 0;

  while (running) {
    try {
      const processed = await outbox.processBatch();

      if (Date.now() - lastSweep > SWEEP_INTERVAL_MS) {
        await sweep.run();
        lastSweep = Date.now();
      }

      // Only idle when there was nothing to do, so a backlog drains fast.
      if (processed === 0) await sleep(IDLE_POLL_MS);
    } catch (err) {
      logger.error(`Worker loop error: ${err instanceof Error ? err.message : String(err)}`);
      await sleep(IDLE_POLL_MS);
    }
  }

  await app.close();
  logger.log("worker stopped cleanly");
}

bootstrap();
