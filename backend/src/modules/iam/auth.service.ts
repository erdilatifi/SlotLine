import { randomBytes, createHash } from "node:crypto";
import { Injectable, Logger } from "@nestjs/common";
import * as argon2 from "argon2";
import { ConflictError, NotFoundError, ValidationError } from "../../platform/errors";
import { PrismaService } from "../../platform/prisma.service";
import { TokensService } from "./tokens.service";

const VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokensService,
  ) {}

  /**
   * Signs the new account straight in. Verification is recorded but has
   * never gated login, and with no email provider wired up (ADR-0002) a
   * "check your inbox" screen would be a dead end — the link only ever
   * reaches the server log.
   */
  async register(
    email: string,
    password: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const existing = await this.prisma.client.user.findUnique({ where: { email } });
    if (existing) throw new ConflictError("An account with this email already exists");

    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    const user = await this.prisma.client.user.create({ data: { email, passwordHash } });

    const rawToken = randomBytes(32).toString("hex");
    await this.prisma.client.verificationToken.create({
      data: {
        userId: user.id,
        purpose: "EMAIL_VERIFICATION",
        tokenHash: hashToken(rawToken),
        expiresAt: new Date(Date.now() + VERIFICATION_TOKEN_TTL_MS),
      },
    });
    this.logger.log(`Verification link for ${email}: /auth/verify-email?token=${rawToken}`);

    const accessToken = this.tokens.signAccessToken(user.id);
    const refreshToken = await this.tokens.issueRefreshFamily(user.id);
    return { accessToken, refreshToken };
  }

  async verifyEmail(rawToken: string): Promise<void> {
    const tokenHash = hashToken(rawToken);
    const token = await this.prisma.client.verificationToken.findFirst({
      where: { tokenHash, purpose: "EMAIL_VERIFICATION" },
    });
    if (!token || token.consumedAt || token.expiresAt < new Date()) {
      throw new NotFoundError("Verification link is invalid or expired");
    }

    await this.prisma.client.$transaction([
      this.prisma.client.verificationToken.update({
        where: { id: token.id },
        data: { consumedAt: new Date() },
      }),
      this.prisma.client.user.update({
        where: { id: token.userId },
        data: { emailVerifiedAt: new Date() },
      }),
    ]);
  }

  /** Identical error for "no such user" and "wrong password" — no user-enumeration oracle. */
  async login(
    email: string,
    password: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const user = await this.prisma.client.user.findUnique({ where: { email } });
    // A Google-only account has no password to compare against. Same
    // message as a wrong password, so this doesn't reveal how the account
    // was created either.
    const validPassword = user?.passwordHash
      ? await argon2.verify(user.passwordHash, password)
      : false;
    if (!user || !validPassword) throw new ValidationError("Invalid email or password");

    const accessToken = this.tokens.signAccessToken(user.id);
    const refreshToken = await this.tokens.issueRefreshFamily(user.id);
    return { accessToken, refreshToken };
  }

  async requestPasswordReset(email: string): Promise<void> {
    const user = await this.prisma.client.user.findUnique({ where: { email } });
    if (!user) return; // don't reveal whether the email exists

    const rawToken = randomBytes(32).toString("hex");
    await this.prisma.client.verificationToken.create({
      data: {
        userId: user.id,
        purpose: "PASSWORD_RESET",
        tokenHash: hashToken(rawToken),
        expiresAt: new Date(Date.now() + VERIFICATION_TOKEN_TTL_MS),
      },
    });
    this.logger.log(`Password reset link for ${email}: /auth/reset-password?token=${rawToken}`);
  }

  async resetPassword(rawToken: string, newPassword: string): Promise<void> {
    const tokenHash = hashToken(rawToken);
    const token = await this.prisma.client.verificationToken.findFirst({
      where: { tokenHash, purpose: "PASSWORD_RESET" },
    });
    if (!token || token.consumedAt || token.expiresAt < new Date()) {
      throw new NotFoundError("Reset link is invalid or expired");
    }

    const passwordHash = await argon2.hash(newPassword, { type: argon2.argon2id });
    await this.prisma.client.$transaction([
      this.prisma.client.verificationToken.update({
        where: { id: token.id },
        data: { consumedAt: new Date() },
      }),
      this.prisma.client.user.update({ where: { id: token.userId }, data: { passwordHash } }),
    ]);
    await this.tokens.revokeAllForUser(token.userId);
  }
}
