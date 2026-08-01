import { Module } from "@nestjs/common";
import { IamModule } from "../iam";
import { OrganizationsController } from "./organizations.controller";
import { OrganizationsService } from "./organizations.service";
import { TenantGuard } from "./tenant.guard";

@Module({
  imports: [IamModule],
  controllers: [OrganizationsController],
  providers: [OrganizationsService, TenantGuard],
  exports: [TenantGuard],
})
export class OrganizationsModule {}
