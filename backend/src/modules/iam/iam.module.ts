import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { ConfigService } from "../../config/config.service";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { GoogleAuthService } from "./google-auth.service";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { MembershipsService } from "./memberships.service";
import { TokensService } from "./tokens.service";

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({ secret: config.env.JWT_SECRET }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, TokensService, GoogleAuthService, JwtAuthGuard, MembershipsService],
  exports: [JwtModule, TokensService, JwtAuthGuard, MembershipsService],
})
export class IamModule {}
