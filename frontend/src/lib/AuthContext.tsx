import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "./api";

interface AuthState {
  accessToken: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

// Access token lives only in memory — never localStorage, so an XSS bug
// can't exfiltrate it (handbook Ch. 6.2).
const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .refresh()
      .then((res) => setAccessToken(res.accessToken))
      .catch(() => setAccessToken(null))
      .finally(() => setLoading(false));
  }, []);

  async function login(email: string, password: string) {
    const res = await api.login(email, password);
    setAccessToken(res.accessToken);
  }

  async function register(email: string, password: string) {
    const res = await api.register(email, password);
    setAccessToken(res.accessToken);
  }

  async function logout() {
    await api.logout().catch(() => undefined);
    setAccessToken(null);
  }

  return (
    <AuthContext.Provider value={{ accessToken, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
