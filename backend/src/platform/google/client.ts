/**
 * A plain HTTPS adapter for the two Google APIs this app touches. It lives
 * in platform/ rather than inside a feature module because both calendar
 * sync and Google sign-in need it — putting it in either one made the
 * other import across a feature boundary and produced a cycle.
 *
 * Nothing here knows about our domain: Google's model (attendees,
 * visibility, recurrence exceptions) stops at this file and is translated
 * to plain intervals, so a second calendar provider would implement the
 * same shape without anything upstream changing (handbook Ch. 11.1).
 */

/** Half-open [start, end) in epoch ms — the same convention the
 *  availability engine uses, restated here so infrastructure doesn't
 *  depend on a feature module for a two-field type. */
export interface BusyInterval {
  start: number;
  end: number;
}

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const CALENDAR_API = "https://www.googleapis.com/calendar/v3";

const SCOPES = [
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/calendar.events",
].join(" ");

const SIGN_IN_SCOPES = "openid email profile";
const USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";

/** Marks an event as ours. Inbound sync discards anything carrying it, which
 *  is what stops our own writes coming back as "busy" (handbook Fig. 11.1). */
export const ORIGIN_TAG = "slotlineBookingId";

/** Every outbound call is bounded — the default in most HTTP clients is
 *  "wait forever", and forever is how one slow dependency takes down
 *  endpoints that have nothing to do with it (handbook Ch. 11.5). */
const TIMEOUT_MS = 8_000;

export class GoogleCalendarError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }

  /** Google is telling us the grant is gone — the user revoked access, or
   *  the refresh token expired. Retrying will never help. */
  get isAuthFailure(): boolean {
    return this.status === 400 || this.status === 401;
  }
}

interface GoogleCredentials {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

async function request<T>(url: string, init: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) {
    throw new GoogleCalendarError(`Google returned ${res.status}: ${await res.text()}`, res.status);
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

export function buildConsentUrl(creds: GoogleCredentials, state: string): string {
  const params = new URLSearchParams({
    client_id: creds.clientId,
    redirect_uri: creds.redirectUri,
    response_type: "code",
    scope: SCOPES,
    // offline + consent is what actually yields a refresh token; without
    // both, Google returns only a short-lived access token and the
    // connection silently dies within the hour.
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

/**
 * Sign-in only: identity scopes, no calendar access, and no offline
 * access — we never need to act on the user's behalf later, so asking for
 * a refresh token here would be requesting more than we use.
 */
export function buildSignInUrl(creds: GoogleCredentials, redirectUri: string): string {
  const params = new URLSearchParams({
    client_id: creds.clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SIGN_IN_SCOPES,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

export async function fetchGoogleIdentity(
  accessToken: string,
): Promise<{ sub: string; email: string; emailVerified: boolean; name?: string }> {
  const profile = await request<{
    sub: string;
    email?: string;
    email_verified?: boolean;
    name?: string;
  }>(USERINFO_URL, { headers: { Authorization: `Bearer ${accessToken}` } });

  if (!profile.email) throw new Error("Google account has no email address");
  return {
    sub: profile.sub,
    email: profile.email,
    emailVerified: profile.email_verified === true,
    ...(profile.name !== undefined && { name: profile.name }),
  };
}

export function exchangeCode(creds: GoogleCredentials, code: string, redirectUri?: string) {
  return request<{ access_token: string; refresh_token?: string; expires_in: number }>(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      // Google requires this to match the redirect_uri used to obtain the
      // code exactly — sign-in and calendar connect use different ones.
      redirect_uri: redirectUri ?? creds.redirectUri,
      grant_type: "authorization_code",
      code,
    }),
  });
}

export async function getAccessToken(
  creds: GoogleCredentials,
  refreshToken: string,
): Promise<string> {
  const tokens = await request<{ access_token: string }>(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });
  return tokens.access_token;
}

/** Verb one of the anti-corruption layer: busy intervals for a window.
 *  Google's own model (attendees, visibility, recurrence exceptions) stops
 *  here and never reaches our domain (handbook Ch. 11.1). */
export async function fetchBusyIntervals(
  accessToken: string,
  calendarId: string,
  from: Date,
  to: Date,
): Promise<BusyInterval[]> {
  const result = await request<{
    calendars: Record<string, { busy?: { start: string; end: string }[] }>;
  }>(`${CALENDAR_API}/freeBusy`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      timeMin: from.toISOString(),
      timeMax: to.toISOString(),
      items: [{ id: calendarId }],
    }),
  });

  return (result.calendars[calendarId]?.busy ?? []).map((slot) => ({
    start: new Date(slot.start).getTime(),
    end: new Date(slot.end).getTime(),
  }));
}

/** Verb two: reflect one of our bookings outward, tagged as ours. */
export async function createEvent(
  accessToken: string,
  calendarId: string,
  event: { summary: string; startsAt: Date; endsAt: Date; bookingId: string },
): Promise<string> {
  const created = await request<{ id: string }>(
    `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        summary: event.summary,
        start: { dateTime: event.startsAt.toISOString() },
        end: { dateTime: event.endsAt.toISOString() },
        extendedProperties: { private: { [ORIGIN_TAG]: event.bookingId } },
      }),
    },
  );
  return created.id;
}

export async function deleteEvent(
  accessToken: string,
  calendarId: string,
  eventId: string,
): Promise<void> {
  try {
    await request<void>(
      `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
      { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } },
    );
  } catch (err) {
    // Already gone is the outcome we wanted, not a failure.
    if (err instanceof GoogleCalendarError && (err.status === 404 || err.status === 410)) return;
    throw err;
  }
}
