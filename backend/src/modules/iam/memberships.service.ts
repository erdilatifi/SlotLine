import { Injectable } from "@nestjs/common";
import { ConflictError, ForbiddenError, NotFoundError } from "../../platform/errors";
import { PrismaService } from "../../platform/prisma.service";

type Role = "OWNER" | "ADMIN" | "STAFF";

@Injectable()
export class MembershipsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(organizationId: string) {
    const memberships = await this.prisma.client.membership.findMany({
      where: { organizationId },
      include: { user: { select: { email: true } } },
    });
    return memberships.map((m) => ({ userId: m.userId, email: m.user.email, role: m.role }));
  }

  async add(organizationId: string, email: string, role: Role) {
    const user = await this.prisma.client.user.findUnique({ where: { email } });
    if (!user) throw new NotFoundError(`No user with email "${email}" — they must register first`);

    const existing = await this.prisma.client.membership.findUnique({
      where: { userId_organizationId: { userId: user.id, organizationId } },
    });
    if (existing) throw new ConflictError("This user is already a member");

    await this.prisma.client.membership.create({ data: { userId: user.id, organizationId, role } });
  }

  /** The last owner cannot be demoted or removed (handbook Ch. 6.4). */
  async remove(organizationId: string, userId: string): Promise<void> {
    const membership = await this.prisma.client.membership.findUnique({
      where: { userId_organizationId: { userId, organizationId } },
    });
    if (!membership) throw new NotFoundError("Membership not found");

    if (membership.role === "OWNER") {
      const ownerCount = await this.prisma.client.membership.count({
        where: { organizationId, role: "OWNER" },
      });
      if (ownerCount <= 1) throw new ForbiddenError("Cannot remove the last owner");
    }

    await this.prisma.client.membership.delete({ where: { id: membership.id } });
  }

  async findRole(organizationId: string, userId: string): Promise<Role | null> {
    const membership = await this.prisma.client.membership.findUnique({
      where: { userId_organizationId: { userId, organizationId } },
    });
    return membership?.role ?? null;
  }
}
