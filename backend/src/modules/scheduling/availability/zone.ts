import { DateTime } from "luxon";

/** A wall-clock date, independent of any zone. */
export interface CalendarDate {
  year: number;
  month: number; // 1-12
  day: number;
}

/** A wall-clock time of day, independent of any zone. */
export interface LocalTime {
  hour: number;
  minute: number;
}

/**
 * Resolves a local date + time in an IANA zone to a UTC instant
 * (epoch milliseconds). This is the one place DST ambiguity is handled, and
 * both cases are a deliberate choice, not an accident of the library
 * default — see docs/adr/0007-time-representation.md.
 *
 * Spring-forward gap (e.g. 02:30 on the day Europe/Belgrade jumps from
 * 02:00 to 03:00): that local time never occurs. We shift forward to the
 * first instant that does exist, which is what Luxon does by default —
 * confirmed empirically, not assumed. The alternative (skip the day
 * entirely) would mean a business configured to open at 02:00 simply
 * doesn't open on the one day a year that time doesn't exist, which is a
 * worse outcome than opening an hour later than configured.
 *
 * Fall-back ambiguity (e.g. 02:30 on the day Europe/Belgrade falls back
 * from 03:00 to 02:00, so 02:00–03:00 happens twice): we take the earlier
 * of the two instants, which is Luxon's default. Documented here so it's a
 * decision, not a surprise.
 */
export function localTimeToInstant(date: CalendarDate, time: LocalTime, zone: string): number {
  const dt = DateTime.fromObject(
    { year: date.year, month: date.month, day: date.day, hour: time.hour, minute: time.minute },
    { zone },
  );
  if (!dt.isValid) {
    throw new Error(`Cannot resolve ${JSON.stringify({ date, time, zone })}: ${dt.invalidReason}`);
  }
  return dt.toMillis();
}

/** The calendar date, in `zone`, that `instant` (epoch ms) falls on. */
export function calendarDateOf(instant: number, zone: string): CalendarDate {
  const dt = DateTime.fromMillis(instant, { zone });
  return { year: dt.year, month: dt.month, day: dt.day };
}

/** Adds `days` calendar days to a date, independent of any zone's DST rules. */
export function addDays(date: CalendarDate, days: number): CalendarDate {
  const dt = DateTime.fromObject({ year: date.year, month: date.month, day: date.day }).plus({
    days,
  });
  return { year: dt.year, month: dt.month, day: dt.day };
}

/**
 * Our weekday convention, matching the schema (Figure 2.1): 0 = Sunday .. 6
 * = Saturday — the common JS `Date#getDay()` convention. Luxon's own
 * `.weekday` is ISO-8601 (1 = Monday .. 7 = Sunday), so every read of it
 * goes through this conversion rather than being compared directly.
 */
export function weekdayOf(date: CalendarDate, zone: string): number {
  const dt = DateTime.fromObject({ year: date.year, month: date.month, day: date.day }, { zone });
  return dt.weekday === 7 ? 0 : dt.weekday;
}
