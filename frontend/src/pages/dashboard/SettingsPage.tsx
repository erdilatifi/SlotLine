import { useState } from "react";
import { useNavigate } from "react-router";
import { Alert, Badge, Button, Card, Field, Input, PageHeader, Select } from "../../components/ui";
import { FormSkeleton, PageHeaderSkeleton } from "../../components/Skeletons";
import { useAuth } from "../../lib/AuthContext";
import { useOrg } from "../../lib/OrgContext";
import { dashboardApi } from "../../lib/dashboardApi";

const NOTICE_OPTIONS = [
  { value: 0, label: "No notice needed" },
  { value: 60, label: "1 hour" },
  { value: 120, label: "2 hours" },
  { value: 240, label: "4 hours" },
  { value: 720, label: "12 hours" },
  { value: 1440, label: "1 day" },
  { value: 2880, label: "2 days" },
  { value: 10080, label: "1 week" },
];

const HORIZON_OPTIONS = [7, 14, 30, 60, 90, 180, 365];

/** Every zone the browser knows, so nobody has to type one correctly. */
function timeZones(): string[] {
  const supported = Intl.supportedValuesOf?.("timeZone");
  return supported && supported.length > 0
    ? supported
    : [Intl.DateTimeFormat().resolvedOptions().timeZone];
}

export function SettingsPage() {
  const { token, activeSlug, data, loading, canManage, act, patch, refresh, refreshOrgs } =
    useOrg();
  const { logout } = useAuth();
  const navigate = useNavigate();

  const org = data.organization;
  // Keyed by slug so switching business resets the form, which is simpler
  // and more predictable than syncing it from an effect.
  const [draft, setDraft] = useState({
    key: org?.slug ?? "",
    name: org?.name ?? "",
    timeZone: org?.timeZone ?? "",
    minNoticeMinutes: org?.minNoticeMinutes ?? 0,
    bookingHorizonDays: org?.bookingHorizonDays ?? 30,
  });
  const [saved, setSaved] = useState(false);
  const [confirmName, setConfirmName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"ADMIN" | "STAFF">("STAFF");
  const [inviteError, setInviteError] = useState<string | null>(null);

  if (loading) {
    return (
      <>
        <PageHeaderSkeleton />
        <FormSkeleton />
      </>
    );
  }
  if (!org || !activeSlug) return null;

  if (draft.key !== org.slug) {
    setDraft({
      key: org.slug,
      name: org.name,
      timeZone: org.timeZone,
      minNoticeMinutes: org.minNoticeMinutes,
      bookingHorizonDays: org.bookingHorizonDays,
    });
    return <FormSkeleton />;
  }

  const dirty =
    draft.name !== org.name ||
    draft.timeZone !== org.timeZone ||
    draft.minNoticeMinutes !== org.minNoticeMinutes ||
    draft.bookingHorizonDays !== org.bookingHorizonDays;

  const bookingUrl = `${window.location.origin}/book/${org.slug}`;

  return (
    <>
      <PageHeader title="Settings" subtitle="How your business works and who can get in." />

      <div className="max-w-2xl space-y-6">
        <Card className="p-5">
          <h2 className="font-semibold tracking-tight">Business</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Name">
              <Input
                value={draft.name}
                disabled={!canManage}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </Field>
            <Field label="Booking address" hint="Changing this would break links you've shared">
              <Input value={bookingUrl} readOnly className="text-muted" />
            </Field>
          </div>

          <div className="mt-4">
            <Field
              label="Timezone"
              hint="Your opening hours are read in this zone. Get it wrong and every appointment shifts."
            >
              <Select
                className="w-full"
                value={draft.timeZone}
                disabled={!canManage}
                onChange={(e) => setDraft({ ...draft, timeZone: e.target.value })}
              >
                {timeZones().map((zone) => (
                  <option key={zone} value={zone}>
                    {zone}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="font-semibold tracking-tight">Booking rules</h2>
          <p className="mt-1 text-sm text-muted">
            These decide which times your page is willing to offer.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Notice you need" hint="Nothing sooner than this can be booked">
              <Select
                className="w-full"
                value={draft.minNoticeMinutes}
                disabled={!canManage}
                onChange={(e) => setDraft({ ...draft, minNoticeMinutes: Number(e.target.value) })}
              >
                {NOTICE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="How far ahead" hint="Past this, clients are asked to come back later">
              <Select
                className="w-full"
                value={draft.bookingHorizonDays}
                disabled={!canManage}
                onChange={(e) => setDraft({ ...draft, bookingHorizonDays: Number(e.target.value) })}
              >
                {HORIZON_OPTIONS.map((days) => (
                  <option key={days} value={days}>
                    {days} days
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </Card>

        {canManage && (
          <div className="flex items-center gap-3">
            <Button
              disabled={!dirty}
              onClick={() =>
                void act(
                  () =>
                    dashboardApi.updateOrg(token, activeSlug, {
                      name: draft.name,
                      timeZone: draft.timeZone,
                      minNoticeMinutes: draft.minNoticeMinutes,
                      bookingHorizonDays: draft.bookingHorizonDays,
                    }),
                  (updated) => {
                    patch((c) => ({ ...c, organization: updated }));
                    // The sidebar reads the name from the org list, not the
                    // snapshot, so that has to be re-read as well.
                    void refreshOrgs();
                    setSaved(true);
                    setTimeout(() => setSaved(false), 2200);
                  },
                )
              }
            >
              Save changes
            </Button>
            {saved && <span className="animate-rise text-sm text-accent">Saved</span>}
          </div>
        )}

        <Card className="p-5">
          <h2 className="font-semibold tracking-tight">People with access</h2>
          <p className="mt-1 text-sm text-muted">
            Anyone here can log in and see the diary. This is separate from your team list — a staff
            member doesn't need a login to take bookings.
          </p>

          <div className="mt-4 divide-y divide-line-soft rounded-lg border border-line">
            {data.members.map((member) => (
              <div key={member.userId} className="flex items-center gap-3 px-3 py-2.5">
                <span className="min-w-0 flex-1 truncate text-sm">{member.email}</span>
                <Badge tone={member.role === "OWNER" ? "accent" : "neutral"}>
                  {member.role.toLowerCase()}
                </Badge>
                {canManage && member.role !== "OWNER" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      void act(
                        () => dashboardApi.removeMember(token, activeSlug, member.userId),
                        () =>
                          patch((c) => ({
                            ...c,
                            members: c.members.filter((m) => m.userId !== member.userId),
                          })),
                      )
                    }
                  >
                    Remove
                  </Button>
                )}
              </div>
            ))}
          </div>

          {canManage && (
            <>
              {inviteError && (
                <div className="mt-3">
                  <Alert>{inviteError}</Alert>
                </div>
              )}
              <div className="mt-3 flex flex-wrap items-end gap-2">
                <Input
                  type="email"
                  placeholder="colleague@example.com"
                  className="w-56"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                />
                <Select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as "ADMIN" | "STAFF")}
                >
                  <option value="STAFF">Staff</option>
                  <option value="ADMIN">Admin</option>
                </Select>
                <Button
                  size="sm"
                  disabled={!inviteEmail}
                  onClick={() => {
                    setInviteError(null);
                    void dashboardApi
                      .addMember(token, activeSlug, inviteEmail, inviteRole)
                      .then(async () => {
                        setInviteEmail("");
                        // The member list comes back on the snapshot, and
                        // the server assigns the role, so re-read rather
                        // than guess what it decided.
                        await refresh();
                      })
                      .catch(() =>
                        // They have to have an account already — there's no
                        // invite email, so say so instead of failing mutely.
                        setInviteError(
                          "No account with that email yet. Ask them to sign up first, then add them.",
                        ),
                      );
                  }}
                >
                  Add
                </Button>
              </div>
            </>
          )}
        </Card>

        {data.role === "OWNER" && (
          <Card className="border-red-200 p-5">
            <h2 className="font-semibold tracking-tight text-red-700">Delete this business</h2>
            <p className="mt-1 text-sm text-ink-soft">
              Every booking, client and staff member goes with it, and the booking link stops
              working. This cannot be undone.
            </p>
            <div className="mt-4 flex flex-wrap items-end gap-2">
              <Field label={`Type "${org.name}" to confirm`}>
                <Input
                  className="w-64"
                  value={confirmName}
                  onChange={(e) => setConfirmName(e.target.value)}
                />
              </Field>
              <Button
                variant="danger"
                disabled={confirmName !== org.name}
                onClick={() =>
                  void dashboardApi.deleteOrg(token, activeSlug).then(async () => {
                    // Nothing left to show for this org; start over.
                    await logout();
                    navigate("/login");
                  })
                }
              >
                Delete permanently
              </Button>
            </div>
          </Card>
        )}
      </div>
    </>
  );
}
