import type { Interval } from "./interval";
import { type CalendarDate, type LocalTime, localTimeToInstant, weekdayOf } from "./zone";

/** A recurring declaration of working hours in local wall-clock time. */
export interface WeeklyRule {
  /** 0 = Sunday .. 6 = Saturday — see zone.ts's `weekdayOf` for why. */
  weekday: number;
  startLocal: LocalTime;
  endLocal: LocalTime;
}

/**
 * A date-specific override, which beats the weekly rule entirely rather
 * than merging with it (handbook Ch. 7.3) — "Christmas Eve, we close at
 * 13:00" replaces Christmas Eve's normal hours, it doesn't add to them.
 * `hours: null` means closed all day.
 */
export interface DateOverride {
  date: CalendarDate;
  hours: { startLocal: LocalTime; endLocal: LocalTime } | null;
}

function sameDate(a: CalendarDate, b: CalendarDate): boolean {
  return a.year === b.year && a.month === b.month && a.day === b.day;
}

function toInstantInterval(
  date: CalendarDate,
  zone: string,
  startLocal: LocalTime,
  endLocal: LocalTime,
): Interval {
  return {
    start: localTimeToInstant(date, startLocal, zone),
    end: localTimeToInstant(date, endLocal, zone),
  };
}

/**
 * Resolves the open interval(s) for one calendar date: the date override if
 * one exists for that date, otherwise every weekly rule matching that
 * date's weekday (a business can declare more than one open interval per
 * day — e.g. open mornings and evenings with a break between).
 */
export function resolveOpenIntervalsForDate(
  date: CalendarDate,
  zone: string,
  weeklyRules: WeeklyRule[],
  dateOverrides: DateOverride[],
): Interval[] {
  const override = dateOverrides.find((candidate) => sameDate(candidate.date, date));
  if (override) {
    return override.hours
      ? [toInstantInterval(date, zone, override.hours.startLocal, override.hours.endLocal)]
      : [];
  }

  const weekday = weekdayOf(date, zone);
  return weeklyRules
    .filter((rule) => rule.weekday === weekday)
    .map((rule) => toInstantInterval(date, zone, rule.startLocal, rule.endLocal));
}

/**
 * Resolves open intervals for every calendar date from `start` to `end`
 * (inclusive), in order. The caller decides the range — the availability
 * engine bounds it to the booking horizon (Ch. 7.2).
 */
export function resolveOpenIntervals(
  dates: CalendarDate[],
  zone: string,
  weeklyRules: WeeklyRule[],
  dateOverrides: DateOverride[],
): Interval[] {
  return dates.flatMap((date) =>
    resolveOpenIntervalsForDate(date, zone, weeklyRules, dateOverrides),
  );
}
