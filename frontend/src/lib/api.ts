export const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...options.headers },
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok)
    throw new ApiError(res.status, body.code ?? "UNKNOWN", body.message ?? res.statusText);
  return body as T;
}

/**
 * Refresh tokens are single-use: two concurrent refreshes send the same
 * token, and the server correctly treats the second as a replay and kills
 * the whole token family. React StrictMode double-invokes effects in dev,
 * which triggers exactly that. Share one in-flight request so the app can
 * never refresh against itself.
 */
let inFlightRefresh: Promise<{ accessToken: string }> | null = null;

export const api = {
  register: (email: string, password: string) =>
    request<{ accessToken: string }>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  login: (email: string, password: string) =>
    request<{ accessToken: string }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  refresh: () => {
    inFlightRefresh ??= request<{ accessToken: string }>("/auth/refresh", {
      method: "POST",
    }).finally(() => {
      inFlightRefresh = null;
    });
    return inFlightRefresh;
  },
  logout: () => request("/auth/logout", { method: "POST" }),

  providers: () => request<{ google: boolean }>("/auth/providers"),

  /** Full-page navigation, not fetch — OAuth needs a real browser redirect
   *  so Google can show its own consent screen. */
  startGoogleSignIn: () => {
    window.location.href = `${API_URL}/auth/google`;
  },
};
