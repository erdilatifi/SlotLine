import { Injectable } from "@nestjs/common";
import { NotFoundError } from "../../platform/errors";
import { PrismaService } from "../../platform/prisma.service";
import { CalendarService } from "../calendar";
import { computeAvailability } from "./availability/engine";
import type { Interval } from "./availability/interval";
import type { WeeklyRule } from "./availability/rules";

const DEFAULT_GRANULARITY_MINUTES = 15;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface AvailabilityResult {
  slots: number[];
  /** True when we couldn't reach an external calendar. The caller should
   *  say so rather than present these slots as fully verified — silently
   *  returning times we can't vouch for is worse than admitting it
   *  (handbook Ch. 11.5). */
  externalCalendarUnavailable: boolean;
}

@Injectable()
export class AvailabilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly calendar: CalendarService,
  ) {}

  async forService(
    organizationId: string,
    serviceId: string,
    staffMemberId: string,
    now: number,
  ): Promise<AvailabilityResult> {
    const organization = await this.prisma.client.organization.findUnique({
      where: { id: organizationId },
      select: { minNoticeMinutes: true, bookingHorizonDays: true },
    });
    if (!organization) throw new NotFoundError("Organization not found");

    const service = await this.prisma.client.service.findFirst({
      where: { id: serviceId, organizationId },
    });
    if (!service) throw new NotFoundError("Service not found");

    const staff = await this.prisma.client.staffMember.findFirst({
      where: { id: staffMemberId, organizationId },
    });
    if (!staff) throw new NotFoundError("Staff member not found");

    const horizonEnd = new Date(now + organization.bookingHorizonDays * MS_PER_DAY);

    const [rules, timeOff, bookings, holds, externalBusy] = await Promise.all([
      this.prisma.client.scheduleRule.findMany({ where: { staffMemberId } }),
      this.prisma.client.timeOff.findMany({ where: { staffMemberId } }),
      this.prisma.client.booking.findMany({
        where: { staffMemberId, status: { in: ["PENDING", "CONFIRMED"] } },
        select: { startsAt: true, endsAt: true },
      }),
      this.prisma.client.hold.findMany({
        where: { staffMemberId, expiresAt: { gt: new Date() } },
        select: { startsAt: true, endsAt: true },
      }),
      this.calendar.externalBusy(staffMemberId, new Date(now), horizonEnd),
    ]);

    const weeklyRules: WeeklyRule[] = rules.map((rule) => ({
      weekday: rule.weekday,
      startLocal: { hour: rule.startHour, minute: rule.startMinute },
      endLocal: { hour: rule.endHour, minute: rule.endMinute },
    }));

    const ownBusy: Interval[] = [...bookings, ...holds].map((b) => ({
      start: b.startsAt.getTime(),
      end: b.endsAt.getTime(),
    }));

    const slots = computeAvailability({
      zone: staff.timeZone,
      weeklyRules,
      dateOverrides: [],
      timeOff: timeOff.map((t) => ({ start: t.startsAt.getTime(), end: t.endsAt.getTime() })),
      busy: [...ownBusy, ...(externalBusy ?? [])],
      bufferBeforeMinutes: service.bufferBeforeMin,
      bufferAfterMinutes: service.bufferAfterMin,
      minimumNoticeMinutes: organization.minNoticeMinutes,
      horizonDays: organization.bookingHorizonDays,
      slotGranularityMinutes: DEFAULT_GRANULARITY_MINUTES,
      serviceDurationMinutes: service.durationMin,
      now,
    });

    return { slots, externalCalendarUnavailable: externalBusy === null };
  }
}
