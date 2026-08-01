import { useState } from "react";
import { Button, Card, EmptyState, Input, PageHeader, Tabs } from "../../components/ui";
import { CalendarConnection } from "../../components/CalendarConnection";
import { HoursEditor, TimeOffEditor } from "../../components/ScheduleEditors";
import { PageHeaderSkeleton, TableSkeleton } from "../../components/Skeletons";
import { cn } from "../../lib/cn";
import { useOrg } from "../../lib/OrgContext";
import { dashboardApi } from "../../lib/dashboardApi";

const WEEKDAY_INITIAL = ["S", "M", "T", "W", "T", "F", "S"];
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

export function TeamPage() {
  const { token, activeSlug, data, loading, canManage, act, patch } = useOrg();
  const [openId, setOpenId] = useState<string | null>(null);
  const [tab, setTab] = useState<"hours" | "away">("hours");
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  if (loading) {
    return (
      <>
        <PageHeaderSkeleton />
        <TableSkeleton rows={3} />
      </>
    );
  }

  const rulesFor = (id: string) => data.rules.filter((rule) => rule.staffMemberId === id);

  return (
    <>
      <PageHeader
        title="Team"
        subtitle="Who takes bookings, when they work, and when they're away."
        actions={
          canManage && !adding ? (
            <Button size="sm" onClick={() => setAdding(true)}>
              Add person
            </Button>
          ) : null
        }
      />

      {adding && activeSlug && (
        <Card className="animate-rise mb-4 flex flex-wrap items-end gap-2 p-4">
          <Input
            placeholder="Their name"
            className="w-64"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <Button
            size="sm"
            disabled={!newName}
            onClick={() =>
              void act(
                () => dashboardApi.createStaff(token, activeSlug, newName, timeZone),
                (member) => {
                  patch((c) => ({ ...c, staff: [...c.staff, member] }));
                  setNewName("");
                  setAdding(false);
                },
              )
            }
          >
            Add
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setAdding(false)}>
            Cancel
          </Button>
        </Card>
      )}

      {data.staff.length === 0 && !adding ? (
        <EmptyState
          title="Nobody on the team yet"
          hint="Add yourself, or whoever takes the appointments."
        />
      ) : (
        <div className="space-y-2">
          {data.staff.map((member) => {
            const rules = rulesFor(member.id);
            const away = data.timeOff.filter((t) => t.staffMemberId === member.id);
            const open = openId === member.id;
            const workingDays = new Set(rules.map((r) => r.weekday));

            return (
              <Card key={member.id} className="overflow-hidden">
                <div className="flex flex-wrap items-center gap-4 p-4">
                  <span
                    className={cn(
                      "grid size-9 shrink-0 place-items-center rounded-full text-sm font-medium",
                      member.isBookable
                        ? "bg-accent/10 text-accent ring-1 ring-accent/15"
                        : "bg-surface-sunken text-muted ring-1 ring-line",
                    )}
                  >
                    {member.displayName.charAt(0).toUpperCase()}
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className={cn("font-medium", !member.isBookable && "text-muted")}>
                      {member.displayName}
                      {!member.isBookable && (
                        <span className="ml-2 text-xs font-normal text-muted">paused</span>
                      )}
                    </p>
                    <p className="mt-0.5 text-[13px] text-muted">
                      {rules.length === 0
                        ? "No hours set — not bookable"
                        : `${rules.length} day${rules.length === 1 ? "" : "s"} a week`}
                      {away.length > 0 && ` · ${away.length} booked off`}
                    </p>
                  </div>

                  {/* A week at a glance, so nobody opens the editor just to
                      remember which days someone works. */}
                  <div className="hidden gap-1 sm:flex">
                    {WEEK_ORDER.map((weekday) => (
                      <span
                        key={weekday}
                        title={workingDays.has(weekday) ? "Working" : "Off"}
                        className={cn(
                          "grid size-6 place-items-center rounded text-[10px] font-medium",
                          workingDays.has(weekday)
                            ? "bg-accent/12 text-accent"
                            : "bg-surface-sunken text-muted/50",
                        )}
                      >
                        {WEEKDAY_INITIAL[weekday]}
                      </span>
                    ))}
                  </div>

                  {canManage && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setOpenId(open ? null : member.id)}
                    >
                      {open ? "Close" : "Schedule"}
                    </Button>
                  )}
                </div>

                {open && activeSlug && (
                  <div className="animate-rise border-t border-line-soft bg-surface-sunken/40 p-4">
                    <div className="max-w-xs">
                      <Tabs
                        value={tab}
                        onChange={setTab}
                        options={[
                          { value: "hours", label: "Weekly hours" },
                          { value: "away", label: "Time off" },
                        ]}
                      />
                    </div>

                    <div className="mt-4">
                      {tab === "hours" ? (
                        <HoursEditor
                          token={token}
                          slug={activeSlug}
                          staffMemberId={member.id}
                          initial={rules}
                          onSaved={(saved) =>
                            patch((c) => ({
                              ...c,
                              rules: [
                                ...c.rules.filter((r) => r.staffMemberId !== member.id),
                                ...saved.map((r, i) => ({
                                  ...r,
                                  id: `${member.id}-${i}`,
                                  staffMemberId: member.id,
                                })),
                              ],
                            }))
                          }
                        />
                      ) : (
                        <TimeOffEditor
                          token={token}
                          slug={activeSlug}
                          staffMemberId={member.id}
                          entries={away}
                          onAdd={(entry) =>
                            patch((c) => ({ ...c, timeOff: [...c.timeOff, entry] }))
                          }
                          onRemove={(id) =>
                            patch((c) => ({
                              ...c,
                              timeOff: c.timeOff.filter((t) => t.id !== id),
                            }))
                          }
                        />
                      )}
                    </div>

                    <div className="mt-5 border-t border-line-soft pt-4">
                      <CalendarConnection
                        token={token}
                        slug={activeSlug}
                        staffMemberId={member.id}
                      />
                    </div>

                    <div className="mt-4 flex items-center gap-2 border-t border-line-soft pt-4">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() =>
                          void act(
                            () =>
                              dashboardApi.updateStaff(token, activeSlug, member.id, {
                                isBookable: !member.isBookable,
                              }),
                            (updated) =>
                              patch((c) => ({
                                ...c,
                                staff: c.staff.map((s) => (s.id === updated.id ? updated : s)),
                              })),
                          )
                        }
                      >
                        {member.isBookable ? "Pause bookings" : "Resume bookings"}
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        className="ml-auto"
                        onClick={() =>
                          void act(
                            () => dashboardApi.deleteStaff(token, activeSlug, member.id),
                            (result) => {
                              patch((c) => ({
                                ...c,
                                staff:
                                  result.outcome === "deleted"
                                    ? c.staff.filter((s) => s.id !== member.id)
                                    : c.staff.map((s) =>
                                        s.id === member.id ? { ...s, isBookable: false } : s,
                                      ),
                              }));
                              setOpenId(null);
                            },
                          )
                        }
                      >
                        Remove
                      </Button>
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
