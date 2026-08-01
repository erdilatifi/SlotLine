import { Module } from "@nestjs/common";
import { IamModule } from "../iam";
import { OrganizationsModule } from "../organizations";
import { CatalogController } from "./catalog.controller";

@Module({
  imports: [IamModule, OrganizationsModule],
  controllers: [CatalogController],
})
export class CatalogModule {}
