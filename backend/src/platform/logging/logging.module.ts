import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { Module } from "@nestjs/common";
import { LoggerModule } from "nestjs-pino";
import { ConfigModule } from "../../config/config.module";
import { ConfigService } from "../../config/config.service";

function correlationId(req: IncomingMessage, res: ServerResponse): string {
  const header = req.headers["x-correlation-id"];
  const id = (Array.isArray(header) ? header[0] : header) ?? randomUUID();
  res.setHeader("x-correlation-id", id);
  return id;
}

/**
 * Structured logging with one correlation id per request, carried in every
 * log line. That id is what turns "a customer says the reminder never
 * arrived" into a single query instead of an afternoon of guessing.
 */
@Module({
  imports: [
    ConfigModule,
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        pinoHttp: {
          level: configService.env.LOG_LEVEL,
          genReqId: correlationId,
          ...(configService.env.NODE_ENV === "development"
            ? { transport: { target: "pino-pretty", options: { singleLine: true } } }
            : {}),
        },
      }),
    }),
  ],
  exports: [LoggerModule],
})
export class LoggingModule {}
