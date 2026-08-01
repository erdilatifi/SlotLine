import { type CanActivate, type ExecutionContext, Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type { Request } from "express";
import { UnauthenticatedError } from "../../platform/errors";

export interface AuthenticatedRequest extends Request {
  userId: string;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) throw new UnauthenticatedError("Missing bearer token");

    try {
      const payload = this.jwt.verify<{ sub: string }>(header.slice("Bearer ".length));
      req.userId = payload.sub;
      return true;
    } catch {
      throw new UnauthenticatedError("Invalid or expired access token");
    }
  }
}
