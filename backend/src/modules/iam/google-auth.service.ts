import { Injectable } from "@nestjs/common";
import { ConfigService } from "../../config/config.service";
import { ValidationError } from "../../platform/errors";
import { PrismaService } from "../../platform/prisma.service";
import { buildSignInUrl, exchangeCode, fetchGoogleIdentity } from "../../platform/google/client";
import { TokensService } from "./tokens.service";

@Injectable()
export class GoogleAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly tokens: TokensService,
  ) {}

  get enabled(): boolean {
    return Boolean(this.config.env.GOOGLE_CLIENT_ID && this.config.env.GOOGLE_CLIENT_SECRET);
  }

  /** Its own callback path, separate from the calendar one — Google matches
   *  the redirect URI exactly between the consent and token requests. */
  private get redirectUri(): string {
    return this.config.env.GOOGLE_REDIRECT_URI.replace(
      "/calendar/callback",
      "/auth/google/callback",
    );
  }

  private credentials() {
    const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI } = this.config.env;
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      throw new ValidationError("Google sign-in is not configured on this server");
    }
    return {
      clientId: GOOGLE_CLIENT_ID,
      clientSecret: GOOGLE_CLIENT_SECRET,
      redirectUri: GOOGLE_REDIRECT_URI,
    };
  }

  consentUrl(): string {
    return buildSignInUrl(this.credentials(), this.redirectUri);
  }

  /**
   * Completes sign-in and returns a refresh token for the session cookie.
   * The access token isn't returned — the SPA picks one up through its
   * normal silent refresh, so no token ever travels in a URL.
   */
  async completeSignIn(code: string): Promise<string> {
    const tokens = await exchangeCode(this.credentials(), code, this.redirectUri);
    const identity = await fetchGoogleIdentity(tokens.access_token);

    // Google says it hasn't verified this address, so trusting it would let
    // someone claim an account they don't own.
    if (!identity.emailVerified) {
      throw new ValidationError("This Google account's email is not verified");
    }

    const user = await this.findOrCreateUser(identity.sub, identity.email);
    return this.tokens.issueRefreshFamily(user.id);
  }

  /**
   * Matches on the stable Google subject first, then falls back to email so
   * that someone who registered with a password and later uses Google lands
   * in the same account rather than a duplicate.
   */
  private async findOrCreateUser(googleId: string, email: string) {
    const byGoogleId = await this.prisma.client.user.findUnique({ where: { googleId } });
    if (byGoogleId) return byGoogleId;

    const byEmail = await this.prisma.client.user.findUnique({ where: { email } });
    if (byEmail) {
      return this.prisma.client.user.update({
        where: { id: byEmail.id },
        data: { googleId, emailVerifiedAt: byEmail.emailVerifiedAt ?? new Date() },
      });
    }

    // Google has already verified the address, so there's nothing for our
    // own verification email to add.
    return this.prisma.client.user.create({
      data: { email, googleId, emailVerifiedAt: new Date() },
    });
  }
}
