import { type CanActivate, type ExecutionContext, Injectable } from "@nestjs/common";
import type { AuthenticatedRequest } from "../iam";
import { NotFoundError } from "../../platform/errors";
import { PrismaService } from "../../platform/prisma.service";

type Role = "OWNER" | "ADMIN" | "STAFF";

export interface TenantRequest extends AuthenticatedRequest {
  organizationId: string;
  role: Role;
}

/**
 * Resolves the organization from the URL slug and verifies the
 * authenticated user is a member of it. Identical 404 whether the slug
 * doesn't exist or the user just isn't a member — a 403 would confirm the
 * organization exists, turning the endpoint into an enumeration oracle
 * (handbook Ch. 5.4).
 */
@Injectable()
export class TenantGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<TenantRequest>();
    const slug = String(req.params.slug ?? "");

    const organization = await this.prisma.client.organization.findUnique({ where: { slug } });
    if (!organization) throw new NotFoundError("Not found");

    const membership = await this.prisma.client.membership.findUnique({
      where: { userId_organizationId: { userId: req.userId, organizationId: organization.id } },
    });
    if (!membership) throw new NotFoundError("Not found");

    req.organizationId = organization.id;
    req.role = membership.role;
    return true;
  }
}

const ROLE_RANK: Record<Role, number> = { STAFF: 0, ADMIN: 1, OWNER: 2 };

export function hasRole(actual: Role, required: Role): boolean {
  return ROLE_RANK[actual] >= ROLE_RANK[required];
}
