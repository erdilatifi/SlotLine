import { Module } from "@nestjs/common";
import { ConfigModule } from "./config/config.module";
import { NotificationsModule } from "./modules/notifications";
import { LoggingModule } from "./platform/logging/logging.module";
import { PrismaModule } from "./platform/prisma.module";
import { SweepService } from "./platform/outbox/sweep.service";

/**
 * The worker has no HTTP surface. It shares config, logging and the
 * feature modules with the API process — the same modules, never a fork.
 */
@Module({
  imports: [ConfigModule, LoggingModule, PrismaModule, NotificationsModule],
  providers: [SweepService],
})
export class WorkerModule {}
