import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { z } from "zod";
import { AuthenticatedRequest, JwtAuthGuard, MembershipsService } from "../iam";
import { ForbiddenError } from "../../platform/errors";
import { ZodValidationPipe } from "../../platform/zod-pipe";
import { OrganizationsService } from "./organizations.service";
import { hasRole, TenantGuard, type TenantRequest } from "./tenant.guard";

const slugParam = new ZodValidationPipe(z.string().min(1));
const createOrgSchema = z.object({
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+$/, "slug must be lowercase letters, numbers and hyphens"),
  name: z.string().min(1),
  timeZone: z.string().min(1),
});
const addMemberSchema = z.object({
  email: z.string().email(),
  role: z.enum(["ADMIN", "STAFF"]),
});
const updateOrgSchema = z
  .object({
    name: z.string().min(1),
    timeZone: z.string().min(1),
    minNoticeMinutes: z
      .number()
      .int()
      .min(0)
      .max(60 * 24 * 30),
    bookingHorizonDays: z.number().int().min(1).max(365),
  })
  .partial();

@Controller("organizations")
export class OrganizationsController {
  constructor(
    private readonly organizations: OrganizationsService,
    private readonly memberships: MembershipsService,
  ) {}

  // Declared before `:slug` — Nest matches routes in declaration order, so
  // a literal path has to come first or the wildcard swallows it.
  @Get("mine")
  @UseGuards(JwtAuthGuard)
  listMine(@Req() req: AuthenticatedRequest) {
    return this.organizations.listForUser(req.userId);
  }

  @Get(":slug")
  findBySlug(@Param("slug", slugParam) slug: string) {
    return this.organizations.findBySlug(slug);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @HttpCode(201)
  create(
    @Req() req: AuthenticatedRequest,
    @Body(new ZodValidationPipe(createOrgSchema)) body: z.infer<typeof createOrgSchema>,
  ) {
    return this.organizations.create(req.userId, body.slug, body.name, body.timeZone);
  }

  @Patch(":slug")
  @UseGuards(JwtAuthGuard, TenantGuard)
  async update(
    @Req() req: TenantRequest,
    @Body(new ZodValidationPipe(updateOrgSchema)) body: z.infer<typeof updateOrgSchema>,
  ) {
    if (!hasRole(req.role, "ADMIN"))
      throw new ForbiddenError("Only owners and admins can change settings");
    return this.organizations.update(req.organizationId, body);
  }

  /** Cascades to every booking, client and staff member. Owner only. */
  @Delete(":slug")
  @UseGuards(JwtAuthGuard, TenantGuard)
  @HttpCode(200)
  async remove(@Req() req: TenantRequest) {
    if (req.role !== "OWNER") throw new ForbiddenError("Only the owner can delete a business");
    await this.organizations.remove(req.organizationId);
    return { message: "Deleted" };
  }

  @Get(":slug/clients")
  @UseGuards(JwtAuthGuard, TenantGuard)
  listClients(@Req() req: TenantRequest) {
    return this.organizations.clients(req.organizationId);
  }

  @Get(":slug/members")
  @UseGuards(JwtAuthGuard, TenantGuard)
  listMembers(@Req() req: TenantRequest) {
    return this.memberships.list(req.organizationId);
  }

  @Post(":slug/members")
  @UseGuards(JwtAuthGuard, TenantGuard)
  @HttpCode(201)
  async addMember(
    @Req() req: TenantRequest,
    @Body(new ZodValidationPipe(addMemberSchema)) body: z.infer<typeof addMemberSchema>,
  ) {
    if (!hasRole(req.role, "ADMIN"))
      throw new ForbiddenError("Only owners and admins can add members");
    await this.memberships.add(req.organizationId, body.email, body.role);
    return { message: "Member added" };
  }

  @Delete(":slug/members/:userId")
  @UseGuards(JwtAuthGuard, TenantGuard)
  @HttpCode(200)
  async removeMember(@Req() req: TenantRequest, @Param("userId") userId: string) {
    if (!hasRole(req.role, "ADMIN"))
      throw new ForbiddenError("Only owners and admins can remove members");
    await this.memberships.remove(req.organizationId, userId);
    return { message: "Member removed" };
  }
}
