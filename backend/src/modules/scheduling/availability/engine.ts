import { type Interval, fits, intersect, subtractAll } from "./interval";
import { type DateOverride, resolveOpenIntervals, type WeeklyRule } from "./rules";
import { addDays, calendarDateOf, type CalendarDate } from "./zone";

export interface AvailabilityInput {
  zone: string;
  weeklyRules: WeeklyRule[];
  dateOverrides: DateOverride[];

  /** Time off and existing busy blocks, as UTC instant intervals — the
   * caller (a repository, once one exists) is responsible for loading
   * these; this module never touches a database. */
  timeOff: Interval[];
  busy: Interval[];

  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;

  minimumNoticeMinutes: number;
  horizonDays: number;

  slotGranularityMinutes: number;
  serviceDurationMinutes: number;

  /** Epoch ms — the injected clock. Never read from the system clock
   * inside this module (handbook Ch. 7.7); this is the one parameter that
   * carries it in. */
  now: number;
}

const MS_PER_MINUTE = 60_000;
const MS_PER_DAY = 24 * 60 * MS_PER_MINUTE;

/** Defensive cap on how many calendar days this will ever iterate — expansion
 * must always be bounded (handbook Ch. 7.6). horizonDays is expected to be
 * far smaller than this; reaching it means a caller passed an unreasonable
 * horizon or the date-stepping logic has a bug, either of which should fail
 * loudly rather than loop unboundedly. */
const MAX_DAYS_TO_EXPAND = 400;

function inflateBuffers(intervals: Interval[], beforeMs: number, afterMs: number): Interval[] {
  if (beforeMs === 0 && afterMs === 0) return intervals;
  return intervals.map((interval) => ({
    start: interval.start - beforeMs,
    end: interval.end + afterMs,
  }));
}

function isAfterOrEqual(a: CalendarDate, b: CalendarDate): boolean {
  if (a.year !== b.year) return a.year > b.year;
  if (a.month !== b.month) return a.month > b.month;
  return a.day >= b.day;
}

function datesInRange(start: CalendarDate, end: CalendarDate): CalendarDate[] {
  const dates: CalendarDate[] = [];
  let current = start;
  for (let i = 0; i < MAX_DAYS_TO_EXPAND && !isAfterOrEqual(current, end); i++) {
    dates.push(current);
    current = addDays(current, 1);
  }
  dates.push(end);
  return dates;
}

function clampToWindow(intervals: Interval[], window: Interval): Interval[] {
  const clamped: Interval[] = [];
  for (const interval of intervals) {
    const overlap = intersect(interval, window);
    if (overlap) clamped.push(overlap);
  }
  return clamped;
}

/**
 * Answers exactly one question (handbook Ch. 7.1): given an organization's
 * schedule, a date range bounded by the booking horizon, and the current
 * instant, return the set of instants at which a booking of a given
 * duration could legally begin. Pure — no database, no HTTP, no framework
 * import, no system clock read. Every input is a parameter, including
 * "now", which is what makes this testable against a specific DST
 * transition without mocking global time.
 *
 * Slot boundaries are aligned to the UTC epoch, not local wall-clock time.
 * For whole-hour-offset zones (the overwhelming majority, including every
 * zone this project's target market operates in) that's identical to local
 * alignment. It is a known, deliberate simplification for zones with a
 * half-hour or 45-minute offset (e.g. Asia/Kolkata) — revisit if this app
 * ever needs to serve a business in one of those zones.
 */
export function computeAvailability(input: AvailabilityInput): number[] {
  const horizonEnd = input.now + input.horizonDays * MS_PER_DAY;
  const earliestStart = input.now + input.minimumNoticeMinutes * MS_PER_MINUTE;

  const startDate = calendarDateOf(input.now, input.zone);
  const endDate = calendarDateOf(horizonEnd, input.zone);
  const dates = datesInRange(startDate, endDate);

  // Stages 1-2 (Figure 7.1): expand rules/overrides, resolved to UTC instants.
  const open = resolveOpenIntervals(dates, input.zone, input.weeklyRules, input.dateOverrides);

  // Stage 3: subtract time off.
  const afterTimeOff = subtractAll(open, input.timeOff);

  // Stage 4: subtract busy intervals, inflated by buffers.
  const inflatedBusy = inflateBuffers(
    input.busy,
    input.bufferBeforeMinutes * MS_PER_MINUTE,
    input.bufferAfterMinutes * MS_PER_MINUTE,
  );
  const afterBusy = subtractAll(afterTimeOff, inflatedBusy);

  // Stage 5: clamp to [now + minimum notice, horizon].
  const clamped = clampToWindow(afterBusy, { start: earliestStart, end: horizonEnd });

  // Stage 6: slice by granularity, keeping only slots the service fits in.
  const granularityMs = input.slotGranularityMinutes * MS_PER_MINUTE;
  const durationMs = input.serviceDurationMinutes * MS_PER_MINUTE;
  const slots: number[] = [];
  for (const interval of clamped) {
    const firstSlot = Math.ceil(interval.start / granularityMs) * granularityMs;
    for (
      let slotStart = firstSlot;
      fits(interval, slotStart, durationMs);
      slotStart += granularityMs
    ) {
      slots.push(slotStart);
    }
  }
  return slots;
}

export type { WeeklyRule, DateOverride };
export type { Interval };
