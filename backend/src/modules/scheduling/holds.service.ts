import { Injectable } from "@nestjs/common";
import { ConflictError, isExclusionViolation } from "../../platform/errors";
import { PrismaService } from "../../platform/prisma.service";

const HOLD_TTL_MS = 5 * 60 * 1000;

@Injectable()
export class HoldsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(staffMemberId: string, startsAt: Date, endsAt: Date) {
    try {
      return await this.prisma.client.hold.create({
        data: { staffMemberId, startsAt, endsAt, expiresAt: new Date(Date.now() + HOLD_TTL_MS) },
      });
    } catch (err) {
      if (isExclusionViolation(err)) {
        throw new ConflictError("That time is currently held by someone else");
      }
      throw err;
    }
  }

  /**
   * Backing out of the form gives the time back immediately, rather than
   * leaving it locked for the rest of the five minutes. Without this, a
   * client who changes their mind collides with their own hold when they
   * pick the same slot again — and everyone else is blocked meanwhile.
   *
   * Deleting an id that has already expired and been swept is a no-op, not
   * an error: releasing something twice should be as harmless as releasing
   * it once.
   */
  async release(holdId: string): Promise<void> {
    await this.prisma.client.hold.deleteMany({ where: { id: holdId } });
  }
}
