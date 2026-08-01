import { Module } from "@nestjs/common";
import { CalendarModule } from "../calendar";
import { AvailabilityService } from "./availability.service";
import { HoldsService } from "./holds.service";
import { SchedulingController } from "./scheduling.controller";

@Module({
  imports: [CalendarModule],
  controllers: [SchedulingController],
  providers: [AvailabilityService, HoldsService],
  exports: [AvailabilityService],
})
export class SchedulingModule {}
