import { Module } from "@nestjs/common";
import { IamModule } from "../iam";
import { OrganizationsModule } from "../organizations";
import { CalendarController } from "./calendar.controller";
import { CalendarService } from "./calendar.service";

@Module({
  imports: [IamModule, OrganizationsModule],
  controllers: [CalendarController],
  providers: [CalendarService],
  exports: [CalendarService],
})
export class CalendarModule {}
