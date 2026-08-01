import { useEffect, useState } from "react";
import { LogoMark } from "../components/Logo";
import { useParams } from "react-router";
import { Calendar } from "../components/Calendar";
import { Alert, Button, Card, EmptyState, Field, Input, Skeleton } from "../components/ui";
import { cn } from "../lib/cn";
import { schedulingApi, SchedulingError, type Service, type Staff } from "../lib/schedulingApi";

type Step = "service" | "staff" | "time" | "details" | "confirmed";

const STEP_ORDER: Step[] = ["service", "staff", "time", "details"];
const STEP_LABELS: Record<Step, string> = {
  service: "Service",
  staff: "Who",
  time: "When",
  details: "Details",
  confirmed: "Done",
};

/** Slides in on hover to say "this row goes somewhere" without spending a
 *  permanent chevron on every row. */
function Chevron() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden="true"
      className="-translate-x-1 opacity-0 transition-[transform,opacity] duration-200 group-hover:translate-x-0 group-hover:opacity-100"
    >
      <path
        d="M5 3l4 4-4 4"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Says what actually went wrong. Every failure used to report "someone just
 * took that time", which is a lie for a rate limit or a dropped connection
 * and sends people back to pick a slot that was never gone.
 */
function describe(err: unknown): string {
  if (err instanceof SchedulingError) {
    if (err.isConflict) return "Someone just took that time. Here's what's still open.";
    if (err.isRateLimited)
      return "That was a lot of requests at once. Wait a moment and try again.";
    if (err.isOffline) return "Can't reach the server. Check your connection and try again.";
    if (err.status >= 500) return "Something went wrong at our end. Try again in a moment.";
    return err.message;
  }
  return "Something went wrong. Try again.";
}

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

export function BookingPage() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const slug = orgSlug ?? "";
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const [step, setStep] = useState<Step>("service");
  const [loading, setLoading] = useState(true);
  const [services, setServices] = useState<Service[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [selectedStaff, setSelectedStaff] = useState<Staff | null>(null);
  const [slots, setSlots] = useState<number[]>([]);
  const [month, setMonth] = useState(() => new Date());
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);
  const [holdId, setHoldId] = useState<string | null>(null);
  const [holdExpiresAt, setHoldExpiresAt] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [stepLoading, setStepLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    schedulingApi
      .listServices(slug)
      .then((list) => {
        if (!cancelled) setServices(list);
      })
      .catch(() => {
        if (!cancelled) setError("We couldn't load this booking page.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  // Someone can sit on the time step for minutes while other people book.
  // Re-reading on focus means they're choosing from what's free now, not
  // from what was free when the page loaded.
  useEffect(() => {
    if (step !== "time" || !selectedService || !selectedStaff) return;
    const onFocus = () => {
      void schedulingApi
        .availability(slug, selectedService.id, selectedStaff.id)
        .then((res) => setSlots(res.slots))
        .catch(() => undefined);
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [step, slug, selectedService, selectedStaff]);

  // The countdown is the honest expression of a real constraint, so it has
  // to actually tick rather than show a static timestamp.
  useEffect(() => {
    if (!holdExpiresAt) return;
    const tick = () =>
      setSecondsLeft(
        Math.max(0, Math.round((new Date(holdExpiresAt).getTime() - Date.now()) / 1000)),
      );
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [holdExpiresAt]);

  async function reloadSlots(service: Service, member: Staff) {
    const res = await schedulingApi.availability(slug, service.id, member.id);
    setSlots(res.slots);

    // Land on the first day that actually has times, so nobody opens the
    // calendar onto an empty panel and assumes the business is closed.
    const first = res.slots[0];
    if (first !== undefined) {
      const firstDay = new Date(first);
      setSelectedDay(firstDay);
      setMonth(new Date(firstDay.getFullYear(), firstDay.getMonth(), 1));
    } else {
      setSelectedDay(null);
    }
  }

  // Each step advances immediately and shows placeholders while its data
  // arrives. Waiting on the network before moving reads as a dropped tap.
  async function chooseService(service: Service) {
    setSelectedService(service);
    setStep("staff");
    setStepLoading(true);
    try {
      setStaff(await schedulingApi.listStaff(slug));
    } catch {
      setError("Couldn't load the team.");
    } finally {
      setStepLoading(false);
    }
  }

  async function chooseStaff(member: Staff) {
    setSelectedStaff(member);
    setStep("time");
    if (!selectedService) return;
    setStepLoading(true);
    try {
      await reloadSlots(selectedService, member);
    } catch {
      setError("Couldn't load available times.");
    } finally {
      setStepLoading(false);
    }
  }

  async function chooseSlot(slot: number) {
    if (!selectedStaff || !selectedService) return;
    setError(null);
    setBusy(true);
    const startsAt = new Date(slot).toISOString();
    const endsAt = new Date(slot + selectedService.durationMin * 60_000).toISOString();
    try {
      const hold = await schedulingApi.createHold(slug, selectedStaff.id, startsAt, endsAt);
      setSelectedSlot(slot);
      setHoldId(hold.holdId);
      setHoldExpiresAt(hold.expiresAt);
      setStep("details");
    } catch (err) {
      setError(describe(err));
      // Only worth re-reading the day when the times have actually changed.
      // After a rate limit or a dropped connection they haven't, and
      // refetching just burns another request.
      if (err instanceof SchedulingError && err.isConflict) {
        await reloadSlots(selectedService, selectedStaff).catch(() => undefined);
      }
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (!selectedStaff || !selectedService || selectedSlot === null) return;
    setError(null);
    setBusy(true);
    try {
      await schedulingApi.createBooking(slug, {
        staffMemberId: selectedStaff.id,
        serviceId: selectedService.id,
        clientEmail: email,
        clientName: name,
        startsAt: new Date(selectedSlot).toISOString(),
        endsAt: new Date(selectedSlot + selectedService.durationMin * 60_000).toISOString(),
        clientTimeZone: timeZone,
        idempotencyKey: crypto.randomUUID(),
      });
      setHoldId(null);
      setHoldExpiresAt(null);
      setStep("confirmed");
    } catch (err) {
      setError(describe(err));
      // Losing the slot is a normal event, not an error page — go back and
      // show what's left. Any other failure keeps them on the form with
      // their details intact, because the time is still theirs to confirm.
      if (err instanceof SchedulingError && err.isConflict) {
        releaseHold();
        setStep("time");
        await reloadSlots(selectedService, selectedStaff).catch(() => undefined);
      }
    } finally {
      setBusy(false);
    }
  }

  function releaseHold() {
    if (!holdId) return;
    // Fire and forget: the hold expires on its own in five minutes, so a
    // failure here costs a slot briefly rather than breaking anything.
    void schedulingApi.releaseHold(slug, holdId).catch(() => undefined);
    setHoldId(null);
    setHoldExpiresAt(null);
  }

  function back() {
    setError(null);
    if (step === "staff") setStep("service");
    if (step === "time") setStep("staff");
    if (step === "details") {
      releaseHold();
      setStep("time");
    }
  }

  const availableDays = new Set(slots.map((slot) => new Date(slot).toDateString()));
  const daySlots = selectedDay
    ? slots.filter((slot) => new Date(slot).toDateString() === selectedDay.toDateString())
    : [];
  const currentStepIndex = STEP_ORDER.indexOf(step);
  // Picking a time needs a calendar beside its times; every other step is a
  // short list and reads better narrow.
  const width = step === "time" ? "max-w-3xl" : "max-w-lg";

  return (
    <div className="min-h-screen bg-surface-sunken">
      <header className="border-b border-line bg-surface/80 backdrop-blur-md">
        <div className={cn("mx-auto flex items-center gap-2 px-6 py-4", width)}>
          <LogoMark className="size-6" />
          <p className="font-display text-[15px] font-semibold tracking-tight">
            Book an appointment
          </p>
        </div>
      </header>

      <main className={cn("mx-auto px-6 py-8", width)}>
        {/* Progress is always visible so nobody wonders how much is left. */}
        {step !== "confirmed" && (
          <ol className="mb-6 flex items-center gap-2">
            {STEP_ORDER.map((s, i) => (
              <li key={s} className="flex flex-1 flex-col gap-1.5">
                <span
                  className={cn(
                    "h-0.5 rounded-full transition-colors duration-300",
                    i <= currentStepIndex ? "bg-ink" : "bg-line",
                  )}
                />
                <span
                  className={cn(
                    "text-[11px] transition-colors duration-300",
                    i <= currentStepIndex ? "font-medium text-ink" : "text-muted",
                  )}
                >
                  {STEP_LABELS[s]}
                </span>
              </li>
            ))}
          </ol>
        )}

        {error && (
          <div className="mb-4">
            <Alert>{error}</Alert>
          </div>
        )}

        {step !== "service" && step !== "confirmed" && (
          <Button variant="ghost" size="sm" className="mb-3 -ml-3" onClick={back}>
            ← Back
          </Button>
        )}

        {loading && (
          <div className="space-y-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        )}

        {!loading && step === "service" && (
          <div className="space-y-2">
            {services.length === 0 && <EmptyState title="No services are bookable right now." />}
            {services.map((service, i) => (
              <div
                key={service.id}
                className="animate-rise"
                style={{ animationDelay: `${i * 50}ms` }}
              >
                <Card interactive>
                  <button
                    onClick={() => void chooseService(service)}
                    className="group flex w-full items-center justify-between rounded-xl p-4 text-left"
                  >
                    <span className="font-medium">{service.name}</span>
                    <span className="flex items-center gap-2 text-sm text-muted">
                      {service.durationMin} min
                      <Chevron />
                    </span>
                  </button>
                </Card>
              </div>
            ))}
          </div>
        )}

        {step === "staff" && (
          <div className="space-y-2">
            {stepLoading && (
              <>
                <Skeleton className="h-[68px] w-full" />
                <Skeleton className="h-[68px] w-full" />
              </>
            )}
            {!stepLoading && staff.length === 0 && (
              <EmptyState title="Nobody is taking bookings right now." />
            )}
            {staff.map((member, i) => (
              <div
                key={member.id}
                className="animate-rise"
                style={{ animationDelay: `${i * 50}ms` }}
              >
                <Card interactive>
                  <button
                    onClick={() => void chooseStaff(member)}
                    className="group flex w-full items-center gap-3 rounded-xl p-4 text-left"
                  >
                    <span className="grid size-9 place-items-center rounded-full bg-surface-sunken text-sm font-medium text-ink-soft ring-1 ring-line transition-colors group-hover:bg-ink group-hover:text-white group-hover:ring-ink">
                      {member.displayName.charAt(0).toUpperCase()}
                    </span>
                    <span className="font-medium">{member.displayName}</span>
                    <span className="ml-auto text-muted">
                      <Chevron />
                    </span>
                  </button>
                </Card>
              </div>
            ))}
          </div>
        )}

        {step === "time" && (
          <div className="space-y-4">
            {stepLoading ? (
              <div className="grid items-start gap-6 sm:grid-cols-[320px_1fr]">
                <Skeleton className="h-[336px] w-full" />
                <Skeleton className="h-[336px] w-full" />
              </div>
            ) : slots.length === 0 ? (
              <EmptyState title="No times available" hint="Try a different person or service." />
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
                  <div className="animate-rise flex min-w-0 flex-col">
                    <div className="flex items-baseline justify-between">
                      <p className="text-sm font-medium">
                        {selectedDay.toLocaleDateString([], {
                          weekday: "long",
                          month: "long",
                          day: "numeric",
                        })}
                      </p>
                      {/* Never silently convert — say which clock these are on. */}
                      <p className="truncate pl-2 text-xs text-muted">{timeZone}</p>
                    </div>

                    {/* The list scrolls inside its own column so a busy day
                        doesn't push the calendar off screen. */}
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
                                onClick={() => void chooseSlot(slot)}
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
          </div>
        )}

        {step === "details" && selectedService && selectedSlot !== null && (
          <div className="space-y-4">
            <Card className="p-4">
              <p className="font-medium">{selectedService.name}</p>
              <p className="mt-1 text-sm text-ink-soft">
                {new Date(selectedSlot).toLocaleString([], {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}{" "}
                with {selectedStaff?.displayName}
              </p>
              {secondsLeft !== null && (
                <p className="mt-3 text-sm text-ink-soft">
                  {secondsLeft > 0 ? (
                    <>
                      Holding this time for{" "}
                      <span className="font-medium tabular-nums text-ink">
                        {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, "0")}
                      </span>
                    </>
                  ) : (
                    "Your hold expired — confirming may not succeed."
                  )}
                </p>
              )}
            </Card>

            <Field label="Your name">
              <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
            </Field>
            <Field label="Your email">
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </Field>
            <Button
              size="lg"
              className="w-full"
              disabled={busy || !email || !name}
              onClick={() => void confirm()}
            >
              {busy ? "Confirming…" : "Confirm booking"}
            </Button>
          </div>
        )}

        {step === "confirmed" && selectedService && selectedSlot !== null && (
          <div className="animate-rise">
            <Card className="overflow-hidden p-0 text-center">
              <div className="bg-glow px-6 pt-8 pb-6">
                <span className="animate-pop mx-auto grid size-12 place-items-center rounded-full bg-accent/10 ring-1 ring-accent/20">
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                    <path
                      className="animate-draw"
                      d="M5 10.5l3.5 3.5L15 7"
                      stroke="var(--color-accent)"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>

                <h2 className="mt-4 text-xl font-semibold tracking-tight">You're booked in</h2>
                <p className="mt-1.5 text-sm text-ink-soft">
                  {selectedService.name} with {selectedStaff?.displayName}
                </p>
              </div>

              <div className="border-t border-line-soft px-6 py-5">
                <p className="font-medium">
                  {new Date(selectedSlot).toLocaleString([], {
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </p>
                <p className="mt-3 text-sm text-muted">A confirmation is on its way to {email}.</p>
              </div>
            </Card>
          </div>
        )}
      </main>
    </div>
  );
}
