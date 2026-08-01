import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "../../config/config.service";
import { isCalendarSyncEnabled } from "../../config/env.schema";
import { decrypt, encrypt } from "../../platform/crypto";
import { ValidationError } from "../../platform/errors";
import { PrismaService } from "../../platform/prisma.service";
import {
  buildConsentUrl,
  createEvent,
  deleteEvent,
  exchangeCode,
  fetchBusyIntervals,
  getAccessToken,
  GoogleCalendarError,
  type BusyInterval,
} from "../../platform/google/client";

@Injectable()
export class CalendarService {
  private readonly logger = new Logger(CalendarService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  get enabled(): boolean {
    return isCalendarSyncEnabled(this.config.env);
  }

  private credentials() {
    const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI } = this.config.env;
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      throw new ValidationError("Calendar sync is not configured on this server");
    }
    return {
      clientId: GOOGLE_CLIENT_ID,
      clientSecret: GOOGLE_CLIENT_SECRET,
      redirectUri: GOOGLE_REDIRECT_URI,
    };
  }

  private encryptionKey(): string {
    const key = this.config.env.ENCRYPTION_KEY;
    if (!key) throw new ValidationError("Calendar sync is not configured on this server");
    return key;
  }

  consentUrl(staffMemberId: string): string {
    return buildConsentUrl(this.credentials(), staffMemberId);
  }

  /** Completes the OAuth round trip and stores the refresh token encrypted. */
  async completeConnection(staffMemberId: string, code: string): Promise<void> {
    const tokens = await exchangeCode(this.credentials(), code);
    if (!tokens.refresh_token) {
      throw new ValidationError(
        "Google did not return a refresh token — revoke access and reconnect to force a fresh consent",
      );
    }

    const refreshTokenEnc = encrypt(tokens.refresh_token, this.encryptionKey());
    await this.prisma.client.calendarConnection.upsert({
      where: { staffMemberId },
      update: { refreshTokenEnc, revokedAt: null },
      create: { staffMemberId, refreshTokenEnc },
    });
  }

  async disconnect(staffMemberId: string): Promise<void> {
    await this.prisma.client.calendarConnection.deleteMany({ where: { staffMemberId } });
  }

  async connectionStatus(staffMemberId: string) {
    const connection = await this.prisma.client.calendarConnection.findUnique({
      where: { staffMemberId },
    });
    return {
      configured: this.enabled,
      connected: Boolean(connection && !connection.revokedAt),
      revoked: Boolean(connection?.revokedAt),
    };
  }

  /**
   * Busy intervals from the staff member's own calendar, for the
   * availability engine to subtract.
   *
   * Returns `null` — not an empty array — when we could not reach Google.
   * Empty means "genuinely nothing booked"; null means "we don't know", and
   * the caller surfaces that rather than quietly offering slots it can't
   * vouch for (handbook Ch. 11.5).
   */
  async externalBusy(staffMemberId: string, from: Date, to: Date): Promise<BusyInterval[] | null> {
    if (!this.enabled) return [];

    const connection = await this.prisma.client.calendarConnection.findUnique({
      where: { staffMemberId },
    });
    if (!connection || connection.revokedAt) return [];

    try {
      const accessToken = await getAccessToken(
        this.credentials(),
        decrypt(connection.refreshTokenEnc, this.encryptionKey()),
      );
      return await fetchBusyIntervals(accessToken, connection.googleCalendarId, from, to);
    } catch (err) {
      // A revoked grant degrades this one connection permanently; anything
      // else is transient and shouldn't mark it dead.
      if (err instanceof GoogleCalendarError && err.isAuthFailure) {
        await this.prisma.client.calendarConnection.update({
          where: { id: connection.id },
          data: { revokedAt: new Date() },
        });
        this.logger.warn(`Calendar access revoked for staff ${staffMemberId}`);
        return [];
      }
      this.logger.warn(
        `Could not reach Google for staff ${staffMemberId}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }
  }

  /** Mirrors a confirmed booking into Google, tagged so we never re-import it. */
  async pushBooking(bookingId: string): Promise<void> {
    if (!this.enabled) return;

    const booking = await this.prisma.client.booking.findUnique({
      where: { id: bookingId },
      include: { service: true, staffMember: true, client: true },
    });
    if (!booking) return;

    const connection = await this.prisma.client.calendarConnection.findUnique({
      where: { staffMemberId: booking.staffMemberId },
    });
    if (!connection || connection.revokedAt) return;

    const accessToken = await getAccessToken(
      this.credentials(),
      decrypt(connection.refreshTokenEnc, this.encryptionKey()),
    );
    const googleEventId = await createEvent(accessToken, connection.googleCalendarId, {
      summary: `${booking.service.name} — ${booking.client.name ?? booking.client.email}`,
      startsAt: booking.startsAt,
      endsAt: booking.endsAt,
      bookingId,
    });

    await this.prisma.client.calendarEventMapping.upsert({
      where: { connectionId_bookingId: { connectionId: connection.id, bookingId } },
      update: { googleEventId },
      create: { connectionId: connection.id, bookingId, googleEventId },
    });
  }

  /** Removes the mirrored event when a booking is cancelled. */
  async removeBooking(bookingId: string): Promise<void> {
    if (!this.enabled) return;

    const mapping = await this.prisma.client.calendarEventMapping.findFirst({
      where: { bookingId },
      include: { connection: true },
    });
    if (!mapping || mapping.connection.revokedAt) return;

    const accessToken = await getAccessToken(
      this.credentials(),
      decrypt(mapping.connection.refreshTokenEnc, this.encryptionKey()),
    );
    await deleteEvent(accessToken, mapping.connection.googleCalendarId, mapping.googleEventId);
    await this.prisma.client.calendarEventMapping.delete({ where: { id: mapping.id } });
  }
}
