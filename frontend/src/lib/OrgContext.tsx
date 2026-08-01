import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "./AuthContext";
import { dashboardApi, type DashboardSnapshot, type OrgSummary } from "./dashboardApi";

const EMPTY: DashboardSnapshot = {
  services: [],
  staff: [],
  bookings: [],
  rules: [],
  timeOff: [],
  organization: null,
  members: [],
  role: "STAFF",
};

interface OrgState {
  token: string;
  orgs: OrgSummary[];
  activeSlug: string | null;
  data: DashboardSnapshot;
  loading: boolean;
  /** True while a background refresh is in flight over data already on
   *  screen — enough to show a quiet indicator, not enough to blank the UI. */
  refreshing: boolean;
  error: string | null;
  canManage: boolean;
  setActiveSlug: (slug: string) => void;
  refresh: () => Promise<void>;
  /** Re-reads the list the sidebar and org switcher render from. */
  refreshOrgs: () => Promise<void>;
  /**
   * Runs a mutation and writes the server's own answer straight into the
   * cache, so a one-field edit doesn't cost a full dashboard refetch.
   */
  act: <T>(action: () => Promise<T>, apply: (result: T) => void) => Promise<void>;
  /** Edits the cached snapshot in place. */
  patch: (update: (current: DashboardSnapshot) => DashboardSnapshot) => void;
}

const OrgContext = createContext<OrgState | null>(null);

export const orgKeys = {
  mine: (token: string) => ["orgs", token] as const,
  snapshot: (slug: string) => ["dashboard", slug] as const,
  clients: (slug: string) => ["clients", slug] as const,
  calendar: (slug: string, staffMemberId: string) => ["calendar", slug, staffMemberId] as const,
};

export function OrgProvider({ children }: { children: ReactNode }) {
  const { accessToken } = useAuth();
  const token = accessToken ?? "";
  const queryClient = useQueryClient();

  const [activeSlug, setActiveSlug] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const orgsQuery = useQuery({
    queryKey: orgKeys.mine(token),
    queryFn: () => dashboardApi.myOrgs(token),
    enabled: Boolean(token),
  });

  const orgs = orgsQuery.data ?? [];
  const firstSlug = orgs[0]?.slug ?? null;
  // Deriving during render rather than syncing in an effect: the active org
  // is just "whatever was picked, or the first one".
  const resolvedSlug = activeSlug ?? firstSlug;

  const snapshotQuery = useQuery({
    queryKey: orgKeys.snapshot(resolvedSlug ?? ""),
    queryFn: () => dashboardApi.snapshot(token, resolvedSlug!),
    enabled: Boolean(token && resolvedSlug),
    // Switching between dashboard pages shouldn't refetch — the snapshot is
    // one payload and the SSE stream tells us when it's genuinely stale.
    staleTime: 30_000,
    placeholderData: (previous) => previous,
  });

  async function refresh() {
    if (!resolvedSlug) return;
    await queryClient.invalidateQueries({ queryKey: orgKeys.snapshot(resolvedSlug) });
  }

  async function refreshOrgs() {
    await queryClient.invalidateQueries({ queryKey: orgKeys.mine(token) });
  }

  // A booking made on the public page appears here without a refresh.
  useEffect(() => {
    if (!token || !resolvedSlug) return;
    return dashboardApi.streamBookings(token, resolvedSlug, () => {
      void queryClient.invalidateQueries({ queryKey: orgKeys.snapshot(resolvedSlug) });
    });
  }, [token, resolvedSlug, queryClient]);

  const mutation = useMutation({
    mutationFn: (action: () => Promise<unknown>) => action(),
  });

  async function act<T>(action: () => Promise<T>, apply: (result: T) => void) {
    setActionError(null);
    try {
      apply((await mutation.mutateAsync(action as () => Promise<unknown>)) as T);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Something went wrong.");
      // The local edit never landed, so re-read rather than leave a guess.
      await refresh();
    }
  }

  function patch(update: (current: DashboardSnapshot) => DashboardSnapshot) {
    if (!resolvedSlug) return;
    queryClient.setQueryData<DashboardSnapshot>(orgKeys.snapshot(resolvedSlug), (current) =>
      update(current ?? EMPTY),
    );
  }

  const data = snapshotQuery.data ?? EMPTY;
  const loadError = orgsQuery.isError
    ? "Could not load your businesses."
    : snapshotQuery.isError
      ? "Could not load this business."
      : null;

  return (
    <OrgContext.Provider
      value={{
        token,
        orgs,
        activeSlug: resolvedSlug,
        data,
        loading: orgsQuery.isPending || (Boolean(resolvedSlug) && !snapshotQuery.data),
        refreshing: snapshotQuery.isFetching && Boolean(snapshotQuery.data),
        error: actionError ?? loadError,
        canManage: data.role === "OWNER" || data.role === "ADMIN",
        setActiveSlug,
        refresh,
        refreshOrgs,
        act,
        patch,
      }}
    >
      {children}
    </OrgContext.Provider>
  );
}

export function useOrg(): OrgState {
  const context = useContext(OrgContext);
  if (!context) throw new Error("useOrg must be used within OrgProvider");
  return context;
}
