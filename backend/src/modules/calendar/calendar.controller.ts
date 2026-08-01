import { Controller, Delete, Get, Param, Query, Req, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import { ConfigService } from "../../config/config.service";
import { ValidationError } from "../../platform/errors";
import { PrismaService } from "../../platform/prisma.service";
import { JwtAuthGuard } from "../iam";
import { TenantGuard, type TenantRequest } from "../organizations";
import { CalendarService } from "./calendar.service";

@Controller()
export class CalendarController {
  constructor(
    private readonly calendar: CalendarService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  @Get("organizations/:slug/staff/:staffMemberId/calendar")
  @UseGuards(JwtAuthGuard, TenantGuard)
  async status(@Req() req: TenantRequest, @Param("staffMemberId") staffMemberId: string) {
    await this.assertStaffInOrg(req.organizationId, staffMemberId);
    return this.calendar.connectionStatus(staffMemberId);
  }

  @Get("organizations/:slug/staff/:staffMemberId/calendar/connect")
  @UseGuards(JwtAuthGuard, TenantGuard)
  async connect(@Req() req: TenantRequest, @Param("staffMemberId") staffMemberId: string) {
    await this.assertStaffInOrg(req.organizationId, staffMemberId);
    return { url: this.calendar.consentUrl(staffMemberId) };
  }

  @Delete("organizations/:slug/staff/:staffMemberId/calendar")
  @UseGuards(JwtAuthGuard, TenantGuard)
  async disconnect(@Req() req: TenantRequest, @Param("staffMemberId") staffMemberId: string) {
    await this.assertStaffInOrg(req.organizationId, staffMemberId);
    await this.calendar.disconnect(staffMemberId);
    return { message: "Calendar disconnected" };
  }

  /**
   * Google redirects the browser here, so this can't be behind the auth
   * guard — there's no Authorization header on a top-level navigation. The
   * `state` we get back is the staff member id we put there ourselves.
   */
  @Get("calendar/callback")
  async callback(
    @Query("code") code: string,
    @Query("state") state: string,
    @Query("error") error: string,
    @Res() res: Response,
  ) {
    const dashboard = `${this.config.env.FRONTEND_URL}/dashboard`;
    if (error || !code || !state) {
      return res.redirect(`${dashboard}?calendar=denied`);
    }

    try {
      await this.calendar.completeConnection(state, code);
      return res.redirect(`${dashboard}?calendar=connected`);
    } catch {
      return res.redirect(`${dashboard}?calendar=failed`);
    }
  }

  private async assertStaffInOrg(organizationId: string, staffMemberId: string): Promise<void> {
    const staff = await this.prisma.client.staffMember.findFirst({
      where: { id: staffMemberId, organizationId },
    });
    if (!staff) throw new ValidationError("Staff member not found");
  }
}
