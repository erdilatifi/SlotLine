import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Alert, Badge, Card, EmptyState, Input, PageHeader } from "../../components/ui";
import { TableSkeleton } from "../../components/Skeletons";
import { orgKeys, useOrg } from "../../lib/OrgContext";
import { dashboardApi } from "../../lib/dashboardApi";

export function ClientsPage() {
  const { token, activeSlug } = useOrg();
  const [query, setQuery] = useState("");

  const clientsQuery = useQuery({
    queryKey: orgKeys.clients(activeSlug ?? ""),
    queryFn: () => dashboardApi.clients(token, activeSlug!),
    enabled: Boolean(token && activeSlug),
  });

  const clients = clientsQuery.data ?? [];
  const needle = query.trim().toLowerCase();
  const shown = needle
    ? clients.filter(
        (c) =>
          c.email.toLowerCase().includes(needle) || (c.name ?? "").toLowerCase().includes(needle),
      )
    : clients;

  const returning = clients.filter((c) => c.totalBookings > 1).length;

  return (
    <>
      <PageHeader
        title="Clients"
        subtitle={
          clients.length > 0
            ? `${clients.length} ${clients.length === 1 ? "person has" : "people have"} booked with you · ${returning} came back`
            : "Everyone who books with you ends up here."
        }
      />

      {/* A failed load must not look like an empty address book. */}
      {clientsQuery.isError && <Alert>Could not load your clients. Refresh to try again.</Alert>}

      {clientsQuery.isPending ? (
        <TableSkeleton rows={5} />
      ) : clientsQuery.isSuccess && clients.length === 0 ? (
        <EmptyState title="No clients yet" hint="They'll appear here as soon as somebody books." />
      ) : clientsQuery.isSuccess ? (
        <>
          <div className="mb-4 max-w-xs">
            <Input
              placeholder="Search by name or email"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          <Card className="divide-y divide-line-soft overflow-hidden">
            {shown.map((client) => (
              <div
                key={client.id}
                className="flex flex-wrap items-center gap-4 px-4 py-3 transition-colors hover:bg-surface-sunken/50"
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-sunken text-sm font-medium text-ink-soft ring-1 ring-line">
                  {(client.name ?? client.email).charAt(0).toUpperCase()}
                </span>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{client.name ?? client.email}</p>
                  {client.name && <p className="truncate text-[13px] text-muted">{client.email}</p>}
                </div>

                {client.noShows > 0 && (
                  <Badge tone="warning">
                    {client.noShows} no-show{client.noShows === 1 ? "" : "s"}
                  </Badge>
                )}
                {client.totalBookings > 1 && <Badge tone="positive">Regular</Badge>}

                <div className="w-28 text-right">
                  <p className="text-sm tabular-nums">
                    {client.totalBookings} visit{client.totalBookings === 1 ? "" : "s"}
                  </p>
                  {client.lastVisit && (
                    <p className="text-[11px] text-muted">
                      last{" "}
                      {new Date(client.lastVisit).toLocaleDateString([], {
                        day: "numeric",
                        month: "short",
                      })}
                    </p>
                  )}
                </div>
              </div>
            ))}

            {shown.length === 0 && (
              <p className="px-4 py-8 text-center text-sm text-muted">Nobody matches "{query}".</p>
            )}
          </Card>
        </>
      ) : null}
    </>
  );
}
