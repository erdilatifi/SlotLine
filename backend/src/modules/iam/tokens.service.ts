import { randomBytes, randomUUID, createHash } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConflictError, NotFoundError } from "../../platform/errors";
import { PrismaService } from "../../platform/prisma.service";

const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const ACCESS_TOKEN_TTL = "15m";

function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

function generateRawToken(): string {
  return randomBytes(32).toString("hex");
}

@Injectable()
export class TokensService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  signAccessToken(userId: string): string {
    return this.jwt.sign({ sub: userId }, { expiresIn: ACCESS_TOKEN_TTL });
  }

  /** Issues the first refresh token of a new family (login). */
  async issueRefreshFamily(userId: string): Promise<string> {
    const familyId = randomUUID();
    return this.createRefreshToken(userId, familyId);
  }

  private async createRefreshToken(userId: string, familyId: string): Promise<string> {
    const raw = generateRawToken();
    await this.prisma.client.refreshToken.create({
      data: {
        userId,
        familyId,
        tokenHash: hashToken(raw),
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
      },
    });
    return raw;
  }

  /**
   * Consumes a refresh token and issues the next one in its family. If the
   * token was already consumed, this is a replay — the whole family is
   * revoked and every descendant token dies with it (handbook Ch. 6.2).
   */
  async rotate(rawToken: string): Promise<{ userId: string; refreshToken: string }> {
    const tokenHash = hashToken(rawToken);
    const existing = await this.prisma.client.refreshToken.findFirst({ where: { tokenHash } });
    if (!existing) throw new NotFoundError("Refresh token not recognized");

    if (existing.consumedAt || existing.revokedAt || existing.expiresAt < new Date()) {
      await this.prisma.client.refreshToken.updateMany({
        where: { familyId: existing.familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new ConflictError(
        "Refresh token reuse detected — session revoked, please log in again",
      );
    }

    await this.prisma.client.refreshToken.update({
      where: { id: existing.id },
      data: { consumedAt: new Date() },
    });

    const refreshToken = await this.createRefreshToken(existing.userId, existing.familyId);
    return { userId: existing.userId, refreshToken };
  }

  /** Logs out everywhere — revokes every refresh token family for the user. */
  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.client.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Looks up who a refresh token belongs to without consuming it. */
  async findOwner(rawToken: string): Promise<string | null> {
    const token = await this.prisma.client.refreshToken.findFirst({
      where: { tokenHash: hashToken(rawToken) },
    });
    return token?.userId ?? null;
  }
}
