import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LogoMark } from "../components/Logo";
import { Route, Routes, useSearchParams } from "react-router";
import { DashboardShell } from "../components/DashboardShell";
import { Alert, Button, Card, Field, Input, Select } from "../components/ui";
import { HoursEditor } from "../components/ScheduleEditors";
import { cn } from "../lib/cn";
import { useAuth } from "../lib/AuthContext";
import { OrgProvider, useOrg } from "../lib/OrgContext";
import { dashboardApi } from "../lib/dashboardApi";
import { BookingsPage } from "./dashboard/BookingsPage";
import { ClientsPage } from "./dashboard/ClientsPage";
import { ServicesPage } from "./dashboard/ServicesPage";
import { SettingsPage } from "./dashboard/SettingsPage";
import { TeamPage } from "./dashboard/TeamPage";

/**
 * The client lives here rather than at the app root so the public booking
 * funnel — which uses none of this — doesn't carry the library. Refetching
 * on window focus is off: the dashboard already learns about new bookings
 * over its own event stream, and everything else changes when this user
 * changes it. One retry, because a cold free-tier instance can drop the
 * first request of the day.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { refetchOnWindowFocus: false, retry: 1, staleTime: 30_000 },
  },
});

export function DashboardPage() {
  return (
    <QueryClientProvider client={queryClient}>
      <OrgProvider>
        <DashboardRoutes />
      </OrgProvider>
    </QueryClientProvider>
  );
}

function DashboardRoutes() {
  const { orgs, activeSlug, setActiveSlug, data, loading, refreshing, error, canManage } = useOrg();
  const { logout } = useAuth();
  const [params, setParams] = useSearchParams();
  // Google sends the browser back here with the outcome in the URL, since
  // an OAuth redirect can't carry anything else.
  const calendarResult = params.get("calendar");

  if (!loading && orgs.length === 0) return <FirstRun />;

  const someoneHasHours = data.staff.some((member) =>
    data.rules.some((rule) => rule.staffMemberId === member.id),
  );
  const ready = data.services.length > 0 && data.staff.length > 0 && someoneHasHours;

  return (
    <DashboardShell
      orgs={orgs}
      activeSlug={activeSlug}
      onSwitchOrg={setActiveSlug}
      onLogout={() => void logout()}
      live={Boolean(activeSlug)}
      refreshing={refreshing}
    >
      {error && (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      )}

      {calendarResult && (
        <CalendarResult
          outcome={calendarResult}
          onDismiss={() => setParams({}, { replace: true })}
        />
      )}

      {!loading && !ready && canManage && <SetupChecklist />}
      {!loading && ready && activeSlug && <ShareLink slug={activeSlug} />}

      <Routes>
        <Route index element={<BookingsPage />} />
        <Route path="services" element={<ServicesPage />} />
        <Route path="team" element={<TeamPage />} />
        <Route path="clients" element={<ClientsPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Routes>
    </DashboardShell>
  );
}

/** Shown once after the OAuth round trip, then cleared from the URL so a
 *  refresh doesn't repeat it. */
function CalendarResult({ outcome, onDismiss }: { outcome: string; onDismiss: () => void }) {
  const copy: Record<string, string> = {
    connected: "Google Calendar connected. Your existing events now block time here.",
    denied: "Calendar connection cancelled. Nothing changed.",
    failed: "Couldn't connect that calendar. Try again from the Team page.",
  };

  return (
    <Card
      className={cn(
        "animate-rise mb-6 flex flex-wrap items-center gap-3 p-4",
        outcome === "connected" ? "border-accent/30 bg-accent-soft/60" : "",
      )}
    >
      <p className="min-w-0 flex-1 text-sm">{copy[outcome] ?? "Calendar updated."}</p>
      <Button variant="ghost" size="sm" onClick={onDismiss}>
        Dismiss
      </Button>
    </Card>
  );
}

/* ------------------------------------------------------------ first run */

/** Before any organisation exists there is nothing to put a sidebar around,
 *  so this is its own screen rather than an empty dashboard. */
function FirstRun() {
  const { token, setActiveSlug, act, refreshOrgs } = useOrg();
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const [form, setForm] = useState({ name: "", slug: "", slugTouched: false });
  const [busy, setBusy] = useState(false);

  return (
    <div className="grid min-h-screen place-items-center bg-surface-sunken px-6 py-12">
      <Card className="animate-rise w-full max-w-lg p-7">
        <LogoMark className="size-10 rounded-xl" />
        <h1 className="mt-5 text-2xl font-semibold tracking-tight">Set up your business</h1>
        <p className="mt-1.5 text-sm text-ink-soft">
          This takes about a minute. The address becomes the link you share with clients.
        </p>

        <div className="mt-6 space-y-4">
          <Field label="Business name">
            <Input
              placeholder="Riverside Barbers"
              value={form.name}
              onChange={(e) => {
                const name = e.target.value;
                // The address follows the name until it's edited by hand, so
                // most people never think about it at all.
                setForm((current) =>
                  current.slugTouched
                    ? { ...current, name }
                    : { ...current, name, slug: slugify(name) },
                );
              }}
            />
          </Field>
          <Field label="Booking address" hint={`slotline.app/book/${form.slug || "…"}`}>
            <Input
              placeholder="riverside-barbers"
              value={form.slug}
              onChange={(e) =>
                setForm({ ...form, slug: slugify(e.target.value), slugTouched: true })
              }
            />
          </Field>
        </div>

        <Button
          size="lg"
          className="mt-6 w-full"
          disabled={!form.name || !form.slug || busy}
          onClick={() => {
            setBusy(true);
            void act(
              () => dashboardApi.createOrg(token, form.slug, form.name, timeZone),
              (org) => {
                setActiveSlug(org.slug);
                void refreshOrgs();
              },
            ).finally(() => setBusy(false));
          }}
        >
          {busy ? "Creating…" : "Create business"}
        </Button>
      </Card>
    </div>
  );
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/* ------------------------------------------------------------ onboarding */

/**
 * A booking page needs a service, a person, and that person's hours before
 * it can offer anything. Without this the first thing a new owner sees is
 * their own empty page, with no clue which of the three is missing.
 */
function SetupChecklist() {
  const { token, activeSlug, data, act, patch } = useOrg();
  const [serviceName, setServiceName] = useState("");
  const [serviceDuration, setServiceDuration] = useState(30);
  const [staffName, setStaffName] = useState("");
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const firstWithoutHours = data.staff.find(
    (member) => !data.rules.some((rule) => rule.staffMemberId === member.id),
  );

  const steps = [
    { key: "org", label: "Create your business", done: true },
    { key: "service", label: "Add something people can book", done: data.services.length > 0 },
    { key: "staff", label: "Add whoever takes the bookings", done: data.staff.length > 0 },
    {
      key: "hours",
      label: "Set their working hours",
      done: data.staff.length > 0 && !firstWithoutHours,
    },
  ];
  const doneCount = steps.filter((step) => step.done).length;
  const current = steps.find((step) => !step.done)?.key;

  if (!activeSlug) return null;

  return (
    <Card className="animate-rise mb-8 overflow-hidden p-0">
      <div className="border-b border-line-soft px-5 py-4">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-semibold tracking-tight">Finish setting up</h2>
          <span className="text-[13px] text-muted tabular-nums">{doneCount} of 4</span>
        </div>
        <div className="mt-3 h-1 overflow-hidden rounded-full bg-surface-sunken">
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-500 ease-out"
            style={{ width: `${(doneCount / steps.length) * 100}%` }}
          />
        </div>
      </div>

      <ol className="divide-y divide-line-soft">
        {steps.map((step) => (
          <li key={step.key} className="px-5 py-4">
            <div className="flex items-center gap-3">
              <StepMark done={step.done} active={step.key === current} />
              <span
                className={cn(
                  "text-sm",
                  step.done ? "text-muted line-through" : "font-medium text-ink",
                )}
              >
                {step.label}
              </span>
            </div>

            {step.key === current && (
              <div className="animate-rise mt-3 pl-8">
                {step.key === "service" && (
                  <div className="flex flex-wrap items-end gap-2">
                    <Input
                      placeholder="Men's cut"
                      className="w-44"
                      value={serviceName}
                      onChange={(e) => setServiceName(e.target.value)}
                    />
                    <Select
                      value={serviceDuration}
                      onChange={(e) => setServiceDuration(Number(e.target.value))}
                    >
                      {[15, 30, 45, 60, 90, 120].map((min) => (
                        <option key={min} value={min}>
                          {min} min
                        </option>
                      ))}
                    </Select>
                    <Button
                      size="sm"
                      disabled={!serviceName}
                      onClick={() =>
                        void act(
                          () =>
                            dashboardApi.createService(token, activeSlug, {
                              name: serviceName,
                              durationMin: serviceDuration,
                            }),
                          (service) => {
                            patch((c) => ({ ...c, services: [...c.services, service] }));
                            setServiceName("");
                          },
                        )
                      }
                    >
                      Add
                    </Button>
                  </div>
                )}

                {step.key === "staff" && (
                  <div className="flex flex-wrap items-end gap-2">
                    <Input
                      placeholder="Your name, or a colleague's"
                      className="w-64"
                      value={staffName}
                      onChange={(e) => setStaffName(e.target.value)}
                    />
                    <Button
                      size="sm"
                      disabled={!staffName}
                      onClick={() =>
                        void act(
                          () => dashboardApi.createStaff(token, activeSlug, staffName, timeZone),
                          (member) => {
                            patch((c) => ({ ...c, staff: [...c.staff, member] }));
                            setStaffName("");
                          },
                        )
                      }
                    >
                      Add
                    </Button>
                  </div>
                )}

                {step.key === "hours" && firstWithoutHours && (
                  <HoursEditor
                    token={token}
                    slug={activeSlug}
                    staffMemberId={firstWithoutHours.id}
                    initial={[]}
                    onSaved={(rules) =>
                      patch((c) => ({
                        ...c,
                        rules: [
                          ...c.rules.filter((r) => r.staffMemberId !== firstWithoutHours.id),
                          ...rules.map((r, i) => ({
                            ...r,
                            id: `${firstWithoutHours.id}-${i}`,
                            staffMemberId: firstWithoutHours.id,
                          })),
                        ],
                      }))
                    }
                  />
                )}
              </div>
            )}
          </li>
        ))}
      </ol>
    </Card>
  );
}

function StepMark({ done, active }: { done: boolean; active: boolean }) {
  if (done) {
    return (
      <span className="grid size-5 shrink-0 place-items-center rounded-full bg-accent">
        <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
          <path
            d="M2.5 6.2l2.4 2.4L9.5 3.8"
            stroke="white"
            strokeWidth="1.9"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    );
  }
  return (
    <span
      className={cn("size-5 shrink-0 rounded-full border-2", active ? "border-ink" : "border-line")}
    />
  );
}

function ShareLink({ slug }: { slug: string }) {
  const [copied, setCopied] = useState(false);
  const url = `${window.location.origin}/book/${slug}`;

  return (
    <Card className="mb-8 flex flex-wrap items-center justify-between gap-3 bg-glow p-4">
      <div className="min-w-0">
        <p className="text-[13px] font-medium">Your booking page is live</p>
        <p className="mt-0.5 truncate font-mono text-[13px] text-muted">{url}</p>
      </div>
      <div className="flex items-center gap-2">
        <a href={url} target="_blank" rel="noreferrer">
          <Button variant="ghost" size="sm">
            Open
          </Button>
        </a>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            void navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 1800);
          }}
        >
          {copied ? "Copied" : "Copy link"}
        </Button>
      </div>
    </Card>
  );
}
