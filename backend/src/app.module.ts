import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { BookingsModule } from "./modules/bookings";
import { CalendarModule } from "./modules/calendar";
import { CatalogModule } from "./modules/catalog";
import { ConfigModule } from "./config/config.module";
import { HealthModule } from "./modules/health";
import { IamModule } from "./modules/iam";
import { OrganizationsModule } from "./modules/organizations";
import { SchedulingModule } from "./modules/scheduling";
import { LoggingModule } from "./platform/logging/logging.module";
import { EmailModule } from "./platform/email.module";
import { PrismaModule } from "./platform/prisma.module";
import { RealtimeModule } from "./platform/realtime.module";

@Module({
  imports: [
    // The public booking surface is unauthenticated by design, so there's
    // no account to throttle — an anonymous caller taking holds on every
    // slot could close a business (handbook Ch. 14.2). Two windows: a
    // short burst limit and a longer sustained one.
    // Limits are per IP, and a household, office or mobile carrier shares
    // one. Twenty in ten seconds sounds generous until two people book at
    // the same time from the same building — the funnel alone is five
    // requests each. The real abuse vector is writing bookings, and that
    // has its own much tighter limit on the endpoint itself.
    ThrottlerModule.forRoot([
      { name: "burst", ttl: 10_000, limit: 60 },
      { name: "sustained", ttl: 60_000, limit: 300 },
    ]),
    ConfigModule,
    LoggingModule,
    PrismaModule,
    RealtimeModule,
    EmailModule,
    HealthModule,
    OrganizationsModule,
    IamModule,
    SchedulingModule,
    CatalogModule,
    CalendarModule,
    BookingsModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
