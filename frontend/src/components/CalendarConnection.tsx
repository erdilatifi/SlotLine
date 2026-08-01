import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge, Button } from "./ui";
import { orgKeys } from "../lib/OrgContext";
import { dashboardApi } from "../lib/dashboardApi";

/**
 * Connecting a calendar is per staff member, not per business — two people
 * in the same shop keep their own diaries, and the availability engine
 * subtracts each one's busy blocks separately.
 */
export function CalendarConnection({
  token,
  slug,
  staffMemberId,
}: {
  token: string;
  slug: string;
  staffMemberId: string;
}) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const statusQuery = useQuery({
    queryKey: orgKeys.calendar(slug, staffMemberId),
    queryFn: () => dashboardApi.calendarStatus(token, slug, staffMemberId),
  });
  const status = statusQuery.data;

  // A failed check used to hide the card, which left someone unable to
  // connect with no idea why. Say so instead.
  if (statusQuery.isError) {
    return (
      <p className="rounded-lg border border-line px-4 py-3 text-[13px] text-muted">
        Couldn't check your calendar connection. Refresh to try again.
      </p>
    );
  }

  // Nothing to offer if the server has no Google credentials.
  if (!status?.configured) return null;

  const setStatus = (next: typeof status) =>
    queryClient.setQueryData(orgKeys.calendar(slug, staffMemberId), next);

  return (
    <div className="rounded-lg border border-line p-4">
      <div className="flex flex-wrap items-center gap-3">
        <GoogleGlyph />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Google Calendar</p>
          <p className="mt-0.5 text-[13px] text-muted">
            {status.connected
              ? "Your own events block these times, and bookings appear in your calendar."
              : status.revoked
                ? "Access was withdrawn on Google's side. Reconnect to start syncing again."
                : "Connect so your existing events block time here automatically."}
          </p>
        </div>

        {status.connected ? (
          <Badge tone="positive">Connected</Badge>
        ) : status.revoked ? (
          <Badge tone="warning">Disconnected</Badge>
        ) : null}

        {status.connected ? (
          <Button
            variant="secondary"
            size="sm"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              setError(null);
              void dashboardApi
                .calendarDisconnect(token, slug, staffMemberId)
                .then(() => setStatus({ ...status, connected: false, revoked: false }))
                .catch(() => setError("Couldn't disconnect. Try again."))
                .finally(() => setBusy(false));
            }}
          >
            Disconnect
          </Button>
        ) : (
          <Button
            size="sm"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              setError(null);
              void dashboardApi
                .calendarConnectUrl(token, slug, staffMemberId)
                .then(({ url }) => {
                  // Top-level navigation: Google's consent screen refuses
                  // to render in an iframe, and fetch can't follow it.
                  window.location.href = url;
                })
                .catch(() => {
                  setError("Couldn't start the connection. Try again.");
                  setBusy(false);
                });
            }}
          >
            {status.revoked ? "Reconnect" : "Connect"}
          </Button>
        )}
      </div>

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}

function GoogleGlyph() {
  return (
    <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-line bg-surface">
      <svg width="17" height="17" viewBox="0 0 18 18" aria-hidden="true">
        <path
          fill="#4285F4"
          d="M17.6 9.2c0-.6-.05-1.2-.16-1.8H9v3.4h4.8a4.1 4.1 0 01-1.8 2.7v2.2h2.9c1.7-1.6 2.7-3.9 2.7-6.5z"
        />
        <path
          fill="#34A853"
          d="M9 18c2.4 0 4.5-.8 6-2.2l-2.9-2.2c-.8.5-1.8.9-3.1.9-2.4 0-4.4-1.6-5.1-3.8H.9v2.3A9 9 0 009 18z"
        />
        <path fill="#FBBC05" d="M3.9 10.7a5.4 5.4 0 010-3.4V5H.9a9 9 0 000 8l3-2.3z" />
        <path
          fill="#EA4335"
          d="M9 3.6c1.3 0 2.5.5 3.4 1.3l2.6-2.6A9 9 0 00.9 5l3 2.3C4.6 5.2 6.6 3.6 9 3.6z"
        />
      </svg>
    </span>
  );
}
