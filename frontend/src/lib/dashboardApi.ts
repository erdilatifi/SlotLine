const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

export interface OrgSummary {
  slug: string;
  name: string;
  timeZone: string;
  role: "OWNER" | "ADMIN" | "STAFF";
}

export interface DashboardBooking {
  id: string;
  startsAt: string;
  endsAt: string;
  status: string;
  client: { email: string; name: string | null };
  service: { name: string };
  staffMember: { displayName: string };
}

export interface Service {
  id: string;
  name: string;
  durationMin: number;
  priceMinor: number;
  currency: string;
  bufferBeforeMin: number;
  bufferAfterMin: number;
  isActive: boolean;
}

export interface Staff {
  id: string;
  displayName: string;
  timeZone: string;
  isBookable: boolean;
}

export interface ScheduleRuleRow {
  weekday: number;
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
}

/** Carries staffMemberId, unlike the per-staff rows the editor works with. */
export interface OwnedRule extends ScheduleRuleRow {
  id: string;
  staffMemberId: string;
}

export interface TimeOffRow {
  id: string;
  staffMemberId: string;
  startsAt: string;
  endsAt: string;
  reason: string | null;
}

export interface OrgSettings {
  slug: string;
  name: string;
  timeZone: string;
  minNoticeMinutes: number;
  bookingHorizonDays: number;
}

export interface Member {
  userId: string;
  email: string;
  role: OrgSummary["role"];
}

export interface CalendarStatus {
  /** False when the server has no Google credentials — the UI hides the
   *  feature entirely rather than offering a button that leads to an error. */
  configured: boolean;
  connected: boolean;
  /** They revoked access on Google's side; booking still works. */
  revoked: boolean;
}

export interface ClientRow {
  id: string;
  email: string;
  name: string | null;
  phone: string | null;
  totalBookings: number;
  noShows: number;
  lastVisit: string | null;
}

export interface DashboardSnapshot {
  services: Service[];
  staff: Staff[];
  bookings: DashboardBooking[];
  rules: OwnedRule[];
  timeOff: TimeOffRow[];
  organization: OrgSettings | null;
  members: Member[];
  role: OrgSummary["role"];
}

async function request<T>(token: string, path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.message ?? `Request failed: ${res.status}`);
  return body as T;
}

export const dashboardApi = {
  myOrgs: (token: string) => request<OrgSummary[]>(token, "/organizations/mine"),

  createOrg: (token: string, slug: string, name: string, timeZone: string) =>
    request<OrgSummary>(token, "/organizations", {
      method: "POST",
      body: JSON.stringify({ slug, name, timeZone }),
    }),

  /** One round trip for the whole dashboard. */
  snapshot: (token: string, slug: string) =>
    request<DashboardSnapshot>(token, `/organizations/${slug}/dashboard`),

  cancelBooking: (token: string, slug: string, bookingId: string) =>
    request<DashboardBooking>(token, `/organizations/${slug}/bookings/${bookingId}/cancel`, {
      method: "POST",
    }),

  closeBooking: (token: string, slug: string, bookingId: string, as: "complete" | "no-show") =>
    request<DashboardBooking>(token, `/organizations/${slug}/bookings/${bookingId}/${as}`, {
      method: "POST",
    }),

  updateOrg: (token: string, slug: string, body: Partial<OrgSettings>) =>
    request<OrgSettings>(token, `/organizations/${slug}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  deleteOrg: (token: string, slug: string) =>
    request<{ message: string }>(token, `/organizations/${slug}`, { method: "DELETE" }),

  clients: (token: string, slug: string) =>
    request<ClientRow[]>(token, `/organizations/${slug}/clients`),

  addMember: (token: string, slug: string, email: string, role: "ADMIN" | "STAFF") =>
    request<{ message: string }>(token, `/organizations/${slug}/members`, {
      method: "POST",
      body: JSON.stringify({ email, role }),
    }),

  removeMember: (token: string, slug: string, userId: string) =>
    request<{ message: string }>(token, `/organizations/${slug}/members/${userId}`, {
      method: "DELETE",
    }),

  calendarStatus: (token: string, slug: string, staffMemberId: string) =>
    request<CalendarStatus>(token, `/organizations/${slug}/staff/${staffMemberId}/calendar`),

  /** Returns Google's consent URL. The caller navigates to it at the top
   *  level — Google won't render its consent screen inside fetch. */
  calendarConnectUrl: (token: string, slug: string, staffMemberId: string) =>
    request<{ url: string }>(
      token,
      `/organizations/${slug}/staff/${staffMemberId}/calendar/connect`,
    ),

  calendarDisconnect: (token: string, slug: string, staffMemberId: string) =>
    request<{ message: string }>(token, `/organizations/${slug}/staff/${staffMemberId}/calendar`, {
      method: "DELETE",
    }),

  createService: (token: string, slug: string, body: Partial<Service> & { name: string }) =>
    request<Service>(token, `/organizations/${slug}/services`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  updateService: (token: string, slug: string, serviceId: string, body: Partial<Service>) =>
    request<Service>(token, `/organizations/${slug}/services/${serviceId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  deleteService: (token: string, slug: string, serviceId: string) =>
    request<{ outcome: "deleted" | "retired" }>(
      token,
      `/organizations/${slug}/services/${serviceId}`,
      { method: "DELETE" },
    ),

  createStaff: (token: string, slug: string, displayName: string, timeZone: string) =>
    request<Staff>(token, `/organizations/${slug}/staff`, {
      method: "POST",
      body: JSON.stringify({ displayName, timeZone }),
    }),

  updateStaff: (token: string, slug: string, staffMemberId: string, body: Partial<Staff>) =>
    request<Staff>(token, `/organizations/${slug}/staff/${staffMemberId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  deleteStaff: (token: string, slug: string, staffMemberId: string) =>
    request<{ outcome: "deleted" | "retired" }>(
      token,
      `/organizations/${slug}/staff/${staffMemberId}`,
      { method: "DELETE" },
    ),

  setHours: (token: string, slug: string, staffMemberId: string, rules: ScheduleRuleRow[]) =>
    request<{ message: string }>(token, `/organizations/${slug}/staff/${staffMemberId}/hours`, {
      method: "PUT",
      body: JSON.stringify({ rules }),
    }),

  createTimeOff: (
    token: string,
    slug: string,
    staffMemberId: string,
    body: { startsAt: string; endsAt: string; reason?: string },
  ) =>
    request<TimeOffRow>(token, `/organizations/${slug}/staff/${staffMemberId}/time-off`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  deleteTimeOff: (token: string, slug: string, staffMemberId: string, timeOffId: string) =>
    request<{ message: string }>(
      token,
      `/organizations/${slug}/staff/${staffMemberId}/time-off/${timeOffId}`,
      { method: "DELETE" },
    ),

  /**
   * Reads the booking stream with fetch rather than EventSource, because
   * EventSource cannot set an Authorization header and the alternative —
   * a token in the query string — ends up in server access logs.
   * Returns an abort function.
   */
  streamBookings(
    token: string,
    slug: string,
    onEvent: (event: { type: string; bookingId: string }) => void,
  ): () => void {
    const controller = new AbortController();

    void (async () => {
      try {
        const res = await fetch(`${API_URL}/organizations/${slug}/bookings/stream`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });
        if (!res.body) return;

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          // Frames are separated by a blank line; anything starting with a
          // colon is a comment (the keep-alive) and carries no data.
          let split = buffer.indexOf("\n\n");
          while (split !== -1) {
            const frame = buffer.slice(0, split);
            buffer = buffer.slice(split + 2);
            const line = frame.split("\n").find((l) => l.startsWith("data:"));
            if (line) {
              try {
                onEvent(JSON.parse(line.slice(5).trim()));
              } catch {
                // A malformed frame isn't worth tearing the stream down for.
              }
            }
            split = buffer.indexOf("\n\n");
          }
        }
      } catch {
        // Aborted on unmount, or the connection dropped. The dashboard
        // still refetches on focus, so this degrades rather than breaks.
      }
    })();

    return () => controller.abort();
  },
};
