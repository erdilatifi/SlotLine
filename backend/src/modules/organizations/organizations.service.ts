import { Injectable } from "@nestjs/common";
import { ConflictError, NotFoundError } from "../../platform/errors";
import { PrismaService } from "../../platform/prisma.service";

@Injectable()
export class OrganizationsService {
  constructor(private readonly prisma: PrismaService) {}

  async findBySlug(slug: string) {
    const organization = await this.prisma.client.organization.findUnique({ where: { slug } });
    if (!organization) throw new NotFoundError(`No organization with slug "${slug}"`);
    return { slug: organization.slug, name: organization.name, timeZone: organization.timeZone };
  }

  async listForUser(userId: string) {
    const memberships = await this.prisma.client.membership.findMany({
      where: { userId },
      include: {
        organization: {
          select: {
            slug: true,
            name: true,
            timeZone: true,
            minNoticeMinutes: true,
            bookingHorizonDays: true,
          },
        },
      },
    });
    return memberships.map((m) => ({ ...m.organization, role: m.role }));
  }

  async update(
    organizationId: string,
    patch: {
      name?: string | undefined;
      timeZone?: string | undefined;
      minNoticeMinutes?: number | undefined;
      bookingHorizonDays?: number | undefined;
    },
  ) {
    const data = Object.fromEntries(
      Object.entries(patch).filter(([, value]) => value !== undefined),
    );
    const organization = await this.prisma.client.organization.update({
      where: { id: organizationId },
      data,
    });
    return {
      slug: organization.slug,
      name: organization.name,
      timeZone: organization.timeZone,
      minNoticeMinutes: organization.minNoticeMinutes,
      bookingHorizonDays: organization.bookingHorizonDays,
    };
  }

  /** Everything cascades from here, so this is genuinely irreversible — the
   *  controller requires OWNER and the UI asks for the name to be typed. */
  async remove(organizationId: string) {
    await this.prisma.client.organization.delete({ where: { id: organizationId } });
  }

  /** The people who have booked here, most recent first. */
  async clients(organizationId: string) {
    const clients = await this.prisma.client.client.findMany({
      where: { organizationId },
      include: {
        bookings: {
          select: { startsAt: true, status: true },
          orderBy: { startsAt: "desc" },
        },
      },
    });

    return clients
      .map((client) => {
        const kept = client.bookings.filter((b) => b.status !== "CANCELLED");
        return {
          id: client.id,
          email: client.email,
          name: client.name,
          phone: client.phone,
          totalBookings: kept.length,
          noShows: client.bookings.filter((b) => b.status === "NO_SHOW").length,
          lastVisit: kept[0]?.startsAt ?? null,
        };
      })
      .sort((a, b) => (b.lastVisit?.getTime() ?? 0) - (a.lastVisit?.getTime() ?? 0));
  }

  /** Creates an organization and makes the creator its owner. */
  async create(ownerUserId: string, slug: string, name: string, timeZone: string) {
    const existing = await this.prisma.client.organization.findUnique({ where: { slug } });
    if (existing) throw new ConflictError(`The slug "${slug}" is already taken`);

    const organization = await this.prisma.client.organization.create({
      data: {
        slug,
        name,
        timeZone,
        memberships: { create: { userId: ownerUserId, role: "OWNER" } },
      },
    });
    return { slug: organization.slug, name: organization.name, timeZone: organization.timeZone };
  }
}
