const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

export interface Service {
  id: string;
  name: string;
  durationMin: number;
  priceMinor: number;
  currency: string;
}

export interface Staff {
  id: string;
  displayName: string;
  timeZone: string;
}

/**
 * Carries the status and error code through, so the funnel can tell a slot
 * that was genuinely taken from a rate limit, a dropped connection or a
 * server fault. Throwing a bare Error made all four look identical, and the
 * funnel reported every one of them as "someone just took that time".
 */
export class SchedulingError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }

  /** The slot really is gone — the only case worth offering fresh times for. */
  get isConflict(): boolean {
    return this.status === 409;
  }

  get isRateLimited(): boolean {
    return this.status === 429;
  }

  /** Never reached the server: offline, DNS, CORS, server down. */
  get isOffline(): boolean {
    return this.status === 0;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, init);
  } catch {
    throw new SchedulingError(0, "NETWORK", "Could not reach the server");
  }

  const data: unknown = await res.json().catch(() => ({}));
  if (!res.ok) {
    const body = data as { code?: string; message?: string };
    throw new SchedulingError(
      res.status,
      body.code ?? "UNKNOWN",
      body.message ?? `Request failed: ${res.status}`,
    );
  }
  return data as T;
}

const get = <T>(path: string) => request<T>(path);

const post = <T>(path: string, body: unknown) =>
  request<T>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

export const schedulingApi = {
  listServices: (orgSlug: string) => get<Service[]>(`/organizations/${orgSlug}/services`),
  listStaff: (orgSlug: string) => get<Staff[]>(`/organizations/${orgSlug}/staff`),
  availability: (orgSlug: string, serviceId: string, staffMemberId: string) =>
    get<{ slots: number[] }>(
      `/organizations/${orgSlug}/availability?serviceId=${serviceId}&staffMemberId=${staffMemberId}`,
    ),
  createHold: (orgSlug: string, staffMemberId: string, startsAt: string, endsAt: string) =>
    post<{ holdId: string; expiresAt: string }>(`/organizations/${orgSlug}/holds`, {
      staffMemberId,
      startsAt,
      endsAt,
    }),
  releaseHold: (orgSlug: string, holdId: string) =>
    request<void>(`/organizations/${orgSlug}/holds/${holdId}`, { method: "DELETE" }),
  createBooking: (
    orgSlug: string,
    input: {
      staffMemberId: string;
      serviceId: string;
      clientEmail: string;
      clientName: string;
      startsAt: string;
      endsAt: string;
      clientTimeZone: string;
      idempotencyKey: string;
    },
  ) => post(`/organizations/${orgSlug}/bookings`, input),
};
