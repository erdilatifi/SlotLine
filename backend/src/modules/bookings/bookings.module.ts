import { Module } from "@nestjs/common";
import { IamModule } from "../iam";
import { OrganizationsModule } from "../organizations";
import { SchedulingModule } from "../scheduling";
import { BookingsController } from "./bookings.controller";
import { BookingsService } from "./bookings.service";
import { ManageBookingController } from "./manage.controller";

@Module({
  imports: [IamModule, OrganizationsModule, SchedulingModule],
  controllers: [BookingsController, ManageBookingController],
  providers: [BookingsService],
})
export class BookingsModule {}
