import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "../config/config.service";

export interface OutgoingEmail {
  to: string;
  subject: string;
  /** Plain text. Every client renders it, and nothing here needs layout. */
  body: string;
}

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const TIMEOUT_MS = 8_000;

/**
 * Sends through Resend when a key is configured, and logs otherwise.
 *
 * Logging is a real mode, not a stub: it's what development runs on, and
 * it's what a deployment without a key falls back to rather than failing
 * bookings because an email provider is unreachable. Delivery is recorded
 * in `EmailDelivery` either way, so the audit trail doesn't depend on
 * which mode is active.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly apiKey: string | undefined;
  private readonly from: string;

  constructor(config: ConfigService) {
    this.apiKey = config.env.RESEND_API_KEY;
    this.from = config.env.EMAIL_FROM;
  }

  get enabled(): boolean {
    return Boolean(this.apiKey);
  }

  async send(email: OutgoingEmail): Promise<void> {
    if (!this.apiKey) {
      this.logger.log(`EMAIL → ${email.to}: ${email.subject}`);
      return;
    }

    const abort = AbortSignal.timeout(TIMEOUT_MS);
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: this.from,
        to: [email.to],
        subject: email.subject,
        text: email.body,
      }),
      signal: abort,
    });

    if (!res.ok) {
      // Thrown so the outbox retries it. The consumer has already written
      // its delivery row, which is what stops a retry sending twice.
      const detail = await res.text().catch(() => "");
      throw new Error(`Resend rejected the message (${res.status}): ${detail.slice(0, 200)}`);
    }
  }
}
