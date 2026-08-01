import { useState, useSyncExternalStore } from "react";
import { Badge, Button, Card, EmptyState, PageHeader, Skeleton, Tabs } from "../../components/ui";
import { DaySchedule } from "../../components/DaySchedule";
import { BookingListSkeleton, PageHeaderSkeleton } from "../../components/Skeletons";
import { cn } from "../../lib/cn";
import { useOrg } from "../../lib/OrgContext";
import { dashboardApi, type DashboardBooking } from "../../lib/dashboardApi";

const STATUS_TONE: Record<string, "neutral" | "accent" | "muted" | "positive" | "warning"> = {
  CONFIRMED: "accent",
  PENDING: "neutral",
  COMPLETED: "positive",
  NO_SHOW: "warning",
  CANCELLED: "muted",
  RESCHEDULED: "muted",
};

const STATUS_LABEL: Record<string, string> = {
  CONFIRMED: "Confirmed",
  PENDING: "Pending",
  COMPLETED: "Came in",
  NO_SHOW: "No-show",
  CANCELLED: "Cancelled",
  RESCHEDULED: "Moved",
};

type Tab = "upcoming" | "past" | "cancelled";

/**
 * The wall clock, read as the external mutable source it actually is.
 * Rounded to the minute so the snapshot is stable between ticks — React
 * requires that — and an appointment slides from "upcoming" into "past"
 * on its own rather than at the next reload.
 */
function useNow(): number {
  return useSyncExternalStore(
    (onChange) => {
      const id = setInterval(onChange, 60_000);
      return () => clearInterval(id);
    },
    () => Math.floor(Date.now() / 60_000) * 60_000,
    () => 0,
  );
}

function dayKey(iso: string): string {
  return new Date(iso).toDateString();
}

function dayLabel(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  const tomorrow = new Date(today.getTime() + 86_400_000);
  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === tomorrow.toDateString()) return "Tomorrow";
  return date.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" });
}

export function BookingsPage() {
  const { token, activeSlug, data, loading, canManage, act, patch } = useOrg();
  const [tab, setTab] = useState<Tab>("upcoming");
  const [view, setView] = useState<"list" | "day">("list");
  const [dayOffset, setDayOffset] = useState(0);

  const now = useNow();
  const upcoming = data.bookings
    .filter((b) => ["CONFIRMED", "PENDING"].includes(b.status) && +new Date(b.startsAt) >= now)
    .sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt));
  const past = data.bookings
    .filter(
      (b) =>
        +new Date(b.startsAt) < now &&
        ["CONFIRMED", "PENDING", "COMPLETED", "NO_SHOW"].includes(b.status),
    )
    .sort((a, b) => +new Date(b.startsAt) - +new Date(a.startsAt));
  const cancelled = data.bookings.filter((b) => ["CANCELLED", "RESCHEDULED"].includes(b.status));

  const shown = tab === "upcoming" ? upcoming : tab === "past" ? past : cancelled;
  const shownDay = new Date(now + dayOffset * 86_400_000);

  // Grouped by day, because that's the unit a business actually thinks in.
  const days = shown.reduce<Record<string, DashboardBooking[]>>((acc, booking) => {
    const key = dayKey(booking.startsAt);
    (acc[key] ??= []).push(booking);
    return acc;
  }, {});

  function update(bookingId: string, status: string) {
    patch((current) => ({
      ...current,
      bookings: current.bookings.map((b) => (b.id === bookingId ? { ...b, status } : b)),
    }));
  }

  if (loading || now === 0) {
    return (
      <>
        <PageHeaderSkeleton />
        <Skeleton className="h-9 w-full max-w-md rounded-lg" />
        <div className="mt-6">
          <BookingListSkeleton />
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Bookings"
        subtitle={
          upcoming.length > 0
            ? `${upcoming.length} coming up`
            : "Everything booked with you shows up here."
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1 sm:max-w-md">
          <Tabs
            value={tab}
            onChange={setTab}
            options={[
              { value: "upcoming", label: "Upcoming", count: upcoming.length },
              { value: "past", label: "Past", count: past.length },
              { value: "cancelled", label: "Cancelled", count: cancelled.length },
            ]}
          />
        </div>
        {tab !== "cancelled" && (
          <div className="w-40">
            <Tabs
              value={view}
              onChange={setView}
              options={[
                { value: "list", label: "List" },
                { value: "day", label: "Day" },
              ]}
            />
          </div>
        )}
      </div>

      {tab !== "cancelled" && view === "day" && (
        <div className="mt-6">
          <div className="mb-3 flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => setDayOffset(dayOffset - 1)}>
              ‹
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setDayOffset(0)}>
              Today
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setDayOffset(dayOffset + 1)}>
              ›
            </Button>
          </div>
          <DaySchedule
            day={shownDay}
            bookings={data.bookings.filter((b) => dayKey(b.startsAt) === shownDay.toDateString())}
          />
        </div>
      )}

      {(tab === "cancelled" || view === "list") && (
        <div className="mt-6 space-y-8">
          {shown.length === 0 && (
            <EmptyState
              title={
                tab === "upcoming"
                  ? "Nothing booked yet"
                  : tab === "past"
                    ? "No past appointments"
                    : "Nothing cancelled"
              }
              hint={
                tab === "upcoming" ? "Share your booking link and they'll appear here." : undefined
              }
            />
          )}

          {Object.entries(days).map(([key, bookings]) => (
            <section key={key}>
              <h2 className="mb-3 text-[13px] font-medium tracking-[0.04em] text-muted uppercase">
                {dayLabel(bookings[0]!.startsAt)}
              </h2>
              <Card className="divide-y divide-line-soft overflow-hidden">
                {bookings.map((booking) => (
                  <div
                    key={booking.id}
                    className="flex flex-wrap items-center gap-4 px-4 py-3.5 transition-colors hover:bg-surface-sunken/50"
                  >
                    {/* Time first: scanning a day means scanning times. */}
                    <div className="w-[4.5rem] shrink-0">
                      <p className="text-[15px] font-medium whitespace-nowrap tabular-nums">
                        {new Date(booking.startsAt).toLocaleTimeString([], {
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </p>
                      <p className="text-[11px] text-muted tabular-nums">
                        {Math.round(
                          (+new Date(booking.endsAt) - +new Date(booking.startsAt)) / 60000,
                        )}{" "}
                        min
                      </p>
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {booking.client.name ?? booking.client.email}
                      </p>
                      <p className="truncate text-[13px] text-muted">
                        {booking.service.name} · {booking.staffMember.displayName}
                      </p>
                    </div>

                    <Badge tone={STATUS_TONE[booking.status] ?? "neutral"}>
                      {STATUS_LABEL[booking.status] ?? booking.status}
                    </Badge>

                    {canManage && activeSlug && (
                      <div className="flex items-center gap-1">
                        {tab === "past" && booking.status === "CONFIRMED" && (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                void act(
                                  () =>
                                    dashboardApi.closeBooking(
                                      token,
                                      activeSlug,
                                      booking.id,
                                      "complete",
                                    ),
                                  () => update(booking.id, "COMPLETED"),
                                )
                              }
                            >
                              Came in
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                void act(
                                  () =>
                                    dashboardApi.closeBooking(
                                      token,
                                      activeSlug,
                                      booking.id,
                                      "no-show",
                                    ),
                                  () => update(booking.id, "NO_SHOW"),
                                )
                              }
                            >
                              No-show
                            </Button>
                          </>
                        )}
                        {tab === "upcoming" && (
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() =>
                              void act(
                                () => dashboardApi.cancelBooking(token, activeSlug, booking.id),
                                () => update(booking.id, "CANCELLED"),
                              )
                            }
                          >
                            Cancel
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </Card>
            </section>
          ))}
        </div>
      )}

      {tab === "upcoming" && view === "list" && upcoming.length > 0 && (
        <p className={cn("mt-8 text-xs text-muted")}>
          New bookings appear here the moment they happen — no need to refresh.
        </p>
      )}
    </>
  );
}
