import { Body, Controller, Get, HttpCode, Post, Query, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { z } from "zod";
import { ConfigService } from "../../config/config.service";
import { ValidationError } from "../../platform/errors";
import { ZodValidationPipe } from "../../platform/zod-pipe";
import { AuthService } from "./auth.service";
import { GoogleAuthService } from "./google-auth.service";
import { TokensService } from "./tokens.service";

const credentialsSchema = z.object({ email: z.string().email(), password: z.string().min(8) });
const emailSchema = z.object({ email: z.string().email() });
const resetSchema = z.object({ token: z.string().min(1), password: z.string().min(8) });

const REFRESH_COOKIE = "refreshToken";

@Controller("auth")
export class AuthController {
  private readonly refreshCookieOptions;

  private readonly frontendUrl: string;

  constructor(
    private readonly auth: AuthService,
    private readonly tokens: TokensService,
    private readonly google: GoogleAuthService,
    config: ConfigService,
  ) {
    this.refreshCookieOptions = {
      httpOnly: true,
      secure: config.env.NODE_ENV === "production",
      sameSite: "lax" as const,
      path: "/auth",
    };
    this.frontendUrl = config.env.FRONTEND_URL;
  }

  /** Lets the UI hide the Google button when the server isn't configured
   *  for it, rather than offering a button that leads to an error. */
  @Get("providers")
  providers() {
    return { google: this.google.enabled };
  }

  @Get("google")
  googleSignIn(@Res() res: Response) {
    return res.redirect(this.google.consentUrl());
  }

  /**
   * Google redirects the browser here, so there's no Authorization header
   * and no JSON response to give back. We set the refresh cookie and bounce
   * to the app, which picks up an access token through its normal silent
   * refresh — so no token ever appears in a URL, where it would end up in
   * browser history and server logs.
   */
  @Get("google/callback")
  async googleCallback(
    @Query("code") code: string,
    @Query("error") error: string,
    @Res() res: Response,
  ) {
    if (error || !code) return res.redirect(`${this.frontendUrl}/login?error=google`);

    try {
      const refreshToken = await this.google.completeSignIn(code);
      res.cookie(REFRESH_COOKIE, refreshToken, this.refreshCookieOptions);
      return res.redirect(`${this.frontendUrl}/dashboard`);
    } catch {
      return res.redirect(`${this.frontendUrl}/login?error=google`);
    }
  }

  @Post("register")
  @HttpCode(201)
  async register(
    @Body(new ZodValidationPipe(credentialsSchema)) body: z.infer<typeof credentialsSchema>,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { accessToken, refreshToken } = await this.auth.register(body.email, body.password);
    res.cookie(REFRESH_COOKIE, refreshToken, this.refreshCookieOptions);
    return { accessToken };
  }

  @Post("verify-email")
  @HttpCode(200)
  async verifyEmail(@Query("token") token: string) {
    if (!token) throw new ValidationError("token is required");
    await this.auth.verifyEmail(token);
    return { message: "Email verified" };
  }

  @Post("login")
  @HttpCode(200)
  async login(
    @Body(new ZodValidationPipe(credentialsSchema)) body: z.infer<typeof credentialsSchema>,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { accessToken, refreshToken } = await this.auth.login(body.email, body.password);
    res.cookie(REFRESH_COOKIE, refreshToken, this.refreshCookieOptions);
    return { accessToken };
  }

  @Post("refresh")
  @HttpCode(200)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const cookieToken: unknown = req.cookies?.[REFRESH_COOKIE];
    if (typeof cookieToken !== "string") throw new ValidationError("No refresh token cookie");

    const { userId, refreshToken } = await this.tokens.rotate(cookieToken);
    res.cookie(REFRESH_COOKIE, refreshToken, this.refreshCookieOptions);
    return { accessToken: this.tokens.signAccessToken(userId) };
  }

  @Post("logout")
  @HttpCode(200)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const cookieToken: unknown = req.cookies?.[REFRESH_COOKIE];
    if (typeof cookieToken === "string") {
      const userId = await this.tokens.findOwner(cookieToken);
      if (userId) await this.tokens.revokeAllForUser(userId);
    }
    res.clearCookie(REFRESH_COOKIE, this.refreshCookieOptions);
    return { message: "Logged out" };
  }

  @Post("password-reset/request")
  @HttpCode(200)
  async requestPasswordReset(
    @Body(new ZodValidationPipe(emailSchema)) body: z.infer<typeof emailSchema>,
  ) {
    await this.auth.requestPasswordReset(body.email);
    return { message: "If that email exists, a reset link was sent" };
  }

  @Post("password-reset/confirm")
  @HttpCode(200)
  async resetPassword(@Body(new ZodValidationPipe(resetSchema)) body: z.infer<typeof resetSchema>) {
    await this.auth.resetPassword(body.token, body.password);
    return { message: "Password updated" };
  }
}
