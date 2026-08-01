import { useEffect, useState } from "react";
import { LogoMark } from "../components/Logo";
import { useNavigate, useParams } from "react-router";
import { Calendar } from "../components/Calendar";
import { Alert, Button, Card, EmptyState, Skeleton } from "../components/ui";
import { manageApi, type ManagedBooking } from "../lib/manageApi";

/** Splits a run of slot instants into morning/afternoon/evening. A flat
 *  list of thirty times is a wall; three labelled groups is a choice. */
function groupByPartOfDay(slots: number[]): { label: string; slots: number[] }[] {
  const groups: Record<string, number[]> = { Morning: [], Afternoon: [], Evening: [] };
  for (const slot of slots) {
    const hour = new Date(slot).getHours();
    const key = hour < 12 ? "Morning" : hour < 17 ? "Afternoon" : "Evening";
    groups[key]!.push(slot);
  }
  return Object.entries(groups)
    .filter(([, list]) => list.length > 0)
    .map(([label, list]) => ({ label, slots: list }));
}

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString([], {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * What the link in a confirmation email opens. No account, no password —
 * the token in the URL is the whole authorisation, and it covers exactly
 * this one appointment.
 */
export function ManageBookingPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();

  const [booking, setBooking] = useState<ManagedBooking | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"view" | "move" | "cancelling">("view");
  const [slots, setSlots] = useState<number[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [month, setMonth] = useState(() => new Date());
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [outcome, setOutcome] = useState<"cancelled" | "moved" | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    manageApi
      .show(token)
      .then((data) => {
        if (!cancelled) setBooking(data);
      })
      .catch(() => {
        if (!cancelled) setError("This link is no longer valid.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function openMove() {
    if (!token) return;
    setMode("move");
    setLoadingSlots(true);
    try {
      const res = await manageApi.options(token);
      setSlots(res.slots);
      const first = res.slots[0];
      if (first !== undefined) {
        const day = new Date(first);
        setSelectedDay(day);
        setMonth(new Date(day.getFullYear(), day.getMonth(), 1));
      }
    } catch {
      setError("Couldn't load other times.");
    } finally {
      setLoadingSlots(false);
    }
  }

  async function move(slot: number) {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      const res = await manageApi.reschedule(token, new Date(slot).toISOString());
      // The old token is spent; the new booking has its own.
      navigate(`/appointment/${res.manageToken}`, { replace: true });
      setOutcome("moved");
      setMode("view");
      setBooking(await manageApi.show(res.manageToken));
    } catch {
      setError("Someone just took that time. Here's what's still open.");
      await openMove();
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      await manageApi.cancel(token);
      setOutcome("cancelled");
      setBooking((current) => (current ? { ...current, status: "CANCELLED" } : current));
      setMode("view");
    } catch {
      setError("Couldn't cancel that. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const availableDays = new Set(slots.map((slot) => new Date(slot).toDateString()));
  const daySlots = selectedDay
    ? slots.filter((slot) => new Date(slot).toDateString() === selectedDay.toDateString())
    : [];

  return (
    <div className="min-h-screen bg-surface-sunken">
      <header className="border-b border-line bg-surface/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-6 py-4">
          <LogoMark className="size-6" />
          <p className="font-display text-[15px] font-semibold tracking-tight">Your appointment</p>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-8">
        {loading && <Skeleton className="h-40 w-full" />}

        {!loading && error && !booking && <Alert>{error}</Alert>}

        {booking && (
          <>
            {error && (
              <div className="mb-4">
                <Alert>{error}</Alert>
              </div>
            )}

            <Card className="animate-rise overflow-hidden p-0">
              <div className="px-6 pt-6 pb-5">
                <p className="text-sm text-muted">{booking.organizationName}</p>
                <h1 className="mt-1 text-xl font-semibold tracking-tight">
                  {booking.serviceName} with {booking.staffName}
                </h1>
                <p className="mt-3 text-lg font-medium">{formatWhen(booking.startsAt)}</p>
                <p className="mt-1 text-sm text-muted">{booking.clientTimeZone}</p>
              </div>

              {booking.status === "CANCELLED" ? (
                <div className="border-t border-line-soft bg-surface-sunken px-6 py-5">
                  <p className="text-sm font-medium">This appointment is cancelled.</p>
                  <p className="mt-1 text-sm text-muted">
                    Need another time? Book again at your convenience.
                  </p>
                  <a href={`/book/${booking.organizationSlug}`} className="mt-3 inline-block">
                    <Button size="sm">Book another</Button>
                  </a>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2 border-t border-line-soft px-6 py-4">
                  <Button size="sm" disabled={busy} onClick={() => void openMove()}>
                    Change the time
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    disabled={busy}
                    onClick={() => setMode("cancelling")}
                  >
                    Cancel
                  </Button>
                </div>
              )}
            </Card>

            {outcome === "moved" && (
              <p className="animate-rise mt-4 text-sm text-accent">
                Moved. We've sent a new confirmation.
              </p>
            )}

            {mode === "cancelling" && (
              <Card className="animate-rise mt-4 p-5">
                <p className="font-medium">Cancel this appointment?</p>
                <p className="mt-1 text-sm text-ink-soft">
                  {booking.organizationName} will be told, and the time goes back up for someone
                  else.
                </p>
                <div className="mt-4 flex gap-2">
                  <Button variant="danger" size="sm" disabled={busy} onClick={() => void cancel()}>
                    {busy ? "Cancelling…" : "Yes, cancel it"}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setMode("view")}>
                    Keep it
                  </Button>
                </div>
              </Card>
            )}

            {mode === "move" && (
              <div className="animate-rise mt-6">
                <h2 className="mb-3 font-semibold tracking-tight">Pick a new time</h2>

                {loadingSlots ? (
                  <div className="grid items-start gap-6 sm:grid-cols-[320px_1fr]">
                    <Skeleton className="h-[336px] w-full" />
                    <Skeleton className="h-[336px] w-full" />
                  </div>
                ) : slots.length === 0 ? (
                  <EmptyState title="No other times available" hint="Try again later." />
                ) : (
                  <div className="grid items-start gap-6 sm:grid-cols-[320px_1fr]">
                    <Calendar
                      month={month}
                      selected={selectedDay}
                      availableDays={availableDays}
                      onSelect={setSelectedDay}
                      onMonthChange={setMonth}
                    />

                    {selectedDay && (
                      <div className="flex min-w-0 flex-col">
                        <p className="text-sm font-medium">
                          {selectedDay.toLocaleDateString([], {
                            weekday: "long",
                            month: "long",
                            day: "numeric",
                          })}
                        </p>
                        <div className="mt-3 space-y-4 sm:max-h-[420px] sm:overflow-y-auto sm:pr-1">
                          {groupByPartOfDay(daySlots).map((group) => (
                            <div key={group.label}>
                              <p className="mb-2 text-[11px] font-medium tracking-[0.06em] text-muted uppercase">
                                {group.label}
                              </p>
                              <div className="grid grid-cols-3 gap-2">
                                {group.slots.map((slot) => (
                                  <button
                                    key={slot}
                                    type="button"
                                    disabled={busy}
                                    onClick={() => void move(slot)}
                                    className="slot rounded-lg border border-line bg-surface py-2.5 text-[13px] font-medium tabular-nums shadow-subtle transition-[color,border-color] duration-200 hover:border-ink hover:text-white disabled:opacity-50"
                                  >
                                    {new Date(slot).toLocaleTimeString([], {
                                      hour: "numeric",
                                      minute: "2-digit",
                                    })}
                                  </button>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <Button variant="ghost" size="sm" className="mt-4" onClick={() => setMode("view")}>
                  ← Keep the time I have
                </Button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
