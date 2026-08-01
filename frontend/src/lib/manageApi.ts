const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

export interface ManagedBooking {
  id: string;
  startsAt: string;
  endsAt: string;
  status: string;
  clientTimeZone: string;
  serviceName: string;
  durationMin: number;
  staffName: string;
  organizationName: string;
  organizationSlug: string;
  clientName: string | null;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.message ?? `Request failed: ${res.status}`);
  return body as T;
}

/** Everything here is authorised by the token in the path — there is no
 *  session, and the token grants exactly one booking. */
export const manageApi = {
  show: (token: string) => request<ManagedBooking>(`/appointments/${token}`),

  options: (token: string) =>
    request<{ slots: number[]; durationMin: number; externalCalendarUnavailable: boolean }>(
      `/appointments/${token}/options`,
    ),

  cancel: (token: string) =>
    request<{ message: string }>(`/appointments/${token}/cancel`, { method: "POST" }),

  reschedule: (token: string, startsAt: string) =>
    request<{ manageToken: string; startsAt: string }>(`/appointments/${token}/reschedule`, {
      method: "POST",
      body: JSON.stringify({ startsAt }),
    }),
};
