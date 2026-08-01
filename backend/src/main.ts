import "reflect-metadata";
import "./config/load-dotenv";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { NestFactory } from "@nestjs/core";
import { Logger } from "nestjs-pino";
import { AppModule } from "./app.module";
import { ConfigService } from "./config/config.service";
import { DomainExceptionFilter } from "./platform/errors";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.useGlobalFilters(new DomainExceptionFilter());
  app.use(helmet());
  app.use(cookieParser());

  const config = app.get(ConfigService);
  app.enableCors({ origin: config.env.FRONTEND_URL, credentials: true });
  await app.listen(config.env.PORT);
}

bootstrap();
