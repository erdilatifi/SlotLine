import { useState } from "react";
import { Button, Input, Select } from "./ui";
import { cn } from "../lib/cn";
import { dashboardApi, type ScheduleRuleRow, type TimeOffRow } from "../lib/dashboardApi";

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
/** Displayed Monday-first, which is how a working week is read, while the
 *  stored weekday stays 0=Sunday to match the availability engine. */
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

const TIME_OPTIONS = Array.from({ length: 48 }, (_, i) => i * 30);

function minutesLabel(totalMinutes: number): string {
  const at = new Date(2000, 0, 1, Math.floor(totalMinutes / 60), totalMinutes % 60);
  return at.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/** The weekly hours the availability engine reads. Days toggle on and off;
 *  each open day carries its own start and end. */
export function HoursEditor({
  token,
  slug,
  staffMemberId,
  initial,
  onSaved,
}: {
  token: string;
  slug: string;
  staffMemberId: string;
  initial: ScheduleRuleRow[];
  onSaved: (rules: ScheduleRuleRow[]) => void;
}) {
  const [rules, setRules] = useState<ScheduleRuleRow[]>(initial);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Every edit goes through the functional form: React batches updates from
  // clicks fired in the same tick, and a closure over `rules` would let the
  // last one silently discard the others.
  function update(next: (current: ScheduleRuleRow[]) => ScheduleRuleRow[]) {
    setSaved(false);
    setRules((current) => [...next(current)].sort((a, b) => a.weekday - b.weekday));
  }

  function toggleDay(weekday: number) {
    update((current) =>
      current.some((rule) => rule.weekday === weekday)
        ? current.filter((rule) => rule.weekday !== weekday)
        : [...current, { weekday, startHour: 9, startMinute: 0, endHour: 17, endMinute: 0 }],
    );
  }

  function setEdge(weekday: number, edge: "start" | "end", totalMinutes: number) {
    const hour = Math.floor(totalMinutes / 60);
    const minute = totalMinutes % 60;
    update((current) =>
      current.map((rule) =>
        rule.weekday === weekday
          ? edge === "start"
            ? { ...rule, startHour: hour, startMinute: minute }
            : { ...rule, endHour: hour, endMinute: minute }
          : rule,
      ),
    );
  }

  const first = rules[0];
  const invalid = rules.some(
    (rule) => rule.startHour * 60 + rule.startMinute >= rule.endHour * 60 + rule.endMinute,
  );

  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {WEEK_ORDER.map((weekday) => {
          const active = rules.some((rule) => rule.weekday === weekday);
          return (
            <button
              key={weekday}
              type="button"
              aria-pressed={active}
              onClick={() => toggleDay(weekday)}
              className={cn(
                "h-8 w-11 rounded-md border text-xs transition-[background-color,border-color,transform] duration-150 active:scale-95",
                active
                  ? "border-ink bg-ink text-white"
                  : "border-line text-muted hover:border-ink/25 hover:text-ink",
              )}
            >
              {WEEKDAY_LABELS[weekday]}
            </button>
          );
        })}
      </div>

      {rules.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {rules.map((rule) => (
            <div key={rule.weekday} className="flex items-center gap-2">
              <span className="w-9 text-xs text-muted">{WEEKDAY_LABELS[rule.weekday]}</span>
              <Select
                aria-label={`${WEEKDAY_LABELS[rule.weekday]} start`}
                value={rule.startHour * 60 + rule.startMinute}
                onChange={(e) => setEdge(rule.weekday, "start", Number(e.target.value))}
              >
                {TIME_OPTIONS.map((minutes) => (
                  <option key={minutes} value={minutes}>
                    {minutesLabel(minutes)}
                  </option>
                ))}
              </Select>
              <span className="text-xs text-muted">to</span>
              <Select
                aria-label={`${WEEKDAY_LABELS[rule.weekday]} end`}
                value={rule.endHour * 60 + rule.endMinute}
                onChange={(e) => setEdge(rule.weekday, "end", Number(e.target.value))}
              >
                {TIME_OPTIONS.map((minutes) => (
                  <option key={minutes} value={minutes}>
                    {minutesLabel(minutes)}
                  </option>
                ))}
              </Select>
            </div>
          ))}

          {rules.length > 1 && first && (
            <button
              type="button"
              onClick={() =>
                update((current) =>
                  current.map((rule) => ({
                    ...rule,
                    startHour: first.startHour,
                    startMinute: first.startMinute,
                    endHour: first.endHour,
                    endMinute: first.endMinute,
                  })),
                )
              }
              className="link-wipe text-xs text-muted transition-colors hover:text-ink"
            >
              Use the same times every day
            </button>
          )}
        </div>
      )}

      {invalid && <p className="mt-2 text-xs text-red-600">A day has to end after it starts.</p>}

      <div className="mt-3 flex items-center gap-2">
        <Button
          size="sm"
          disabled={saving || invalid}
          onClick={() => {
            setSaving(true);
            void dashboardApi
              .setHours(token, slug, staffMemberId, rules)
              .then(() => {
                setSaved(true);
                onSaved(rules);
              })
              .finally(() => setSaving(false));
          }}
        >
          {saving ? "Saving…" : "Save hours"}
        </Button>
        {saved && <span className="animate-rise text-xs text-accent">Saved</span>}
      </div>
    </div>
  );
}

/** Holidays, sick days, a long lunch — anything that carves time out of the
 *  weekly pattern without changing it. */
export function TimeOffEditor({
  token,
  slug,
  staffMemberId,
  entries,
  onAdd,
  onRemove,
}: {
  token: string;
  slug: string;
  staffMemberId: string;
  entries: TimeOffRow[];
  onAdd: (entry: TimeOffRow) => void;
  onRemove: (id: string) => void;
}) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const invalid = Boolean(from && to && new Date(to) <= new Date(from));

  return (
    <div>
      {entries.length === 0 ? (
        <p className="text-xs text-muted">Nothing booked off. Add a holiday or a closed day.</p>
      ) : (
        <ul className="space-y-1.5">
          {entries.map((entry) => (
            <li
              key={entry.id}
              className="flex items-center gap-2 rounded-md border border-line px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <p className="text-[13px]">
                  {new Date(entry.startsAt).toLocaleString([], {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                  {" → "}
                  {new Date(entry.endsAt).toLocaleString([], {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </p>
                {entry.reason && <p className="mt-0.5 text-xs text-muted">{entry.reason}</p>}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  void dashboardApi
                    .deleteTimeOff(token, slug, staffMemberId, entry.id)
                    .then(() => onRemove(entry.id))
                    .catch(() => setError("Could not remove that."))
                }
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <label className="block">
          <span className="text-xs text-muted">From</span>
          <Input
            type="datetime-local"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="mt-1"
          />
        </label>
        <label className="block">
          <span className="text-xs text-muted">Until</span>
          <Input
            type="datetime-local"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="mt-1"
          />
        </label>
      </div>
      <Input
        placeholder="Reason (optional)"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        className="mt-2"
      />

      {invalid && <p className="mt-2 text-xs text-red-600">It has to end after it starts.</p>}
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

      <Button
        size="sm"
        className="mt-3"
        disabled={!from || !to || invalid || busy}
        onClick={() => {
          setBusy(true);
          setError(null);
          void dashboardApi
            .createTimeOff(token, slug, staffMemberId, {
              startsAt: new Date(from).toISOString(),
              endsAt: new Date(to).toISOString(),
              ...(reason ? { reason } : {}),
            })
            .then((entry) => {
              onAdd(entry);
              setFrom("");
              setTo("");
              setReason("");
            })
            .catch(() => setError("Could not save that."))
            .finally(() => setBusy(false));
        }}
      >
        {busy ? "Saving…" : "Book time off"}
      </Button>
    </div>
  );
}
