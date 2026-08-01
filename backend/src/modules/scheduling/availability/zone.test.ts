import { DateTime } from "luxon";
import { describe, expect, it } from "vitest";
import { addDays, calendarDateOf, localTimeToInstant, weekdayOf } from "./zone";

describe("localTimeToInstant", () => {
  it("resolves an ordinary local time in a zone with no DST", () => {
    const instant = localTimeToInstant(
      { year: 2026, month: 6, day: 15 },
      { hour: 9, minute: 0 },
      "UTC",
    );
    expect(DateTime.fromMillis(instant, { zone: "utc" }).toISO()).toBe("2026-06-15T09:00:00.000Z");
  });

  it("resolves the same wall-clock time to a different UTC instant across a DST boundary", () => {
    // Same declared rule ("open at 09:00"), two Mondays either side of the
    // 2026-03-29 EU spring-forward transition — this is the exact scenario
    // Figure 7.2 in the handbook describes.
    const beforeTransition = localTimeToInstant(
      { year: 2026, month: 3, day: 23 },
      { hour: 9, minute: 0 },
      "Europe/Belgrade",
    );
    const afterTransition = localTimeToInstant(
      { year: 2026, month: 3, day: 30 },
      { hour: 9, minute: 0 },
      "Europe/Belgrade",
    );
    expect(DateTime.fromMillis(beforeTransition, { zone: "utc" }).toISO()).toBe(
      "2026-03-23T08:00:00.000Z",
    );
    expect(DateTime.fromMillis(afterTransition, { zone: "utc" }).toISO()).toBe(
      "2026-03-30T07:00:00.000Z",
    );
  });

  it("shifts forward through the spring-forward gap rather than throwing", () => {
    // 2026-03-29 is the day Europe/Belgrade jumps from 02:00 to 03:00 — a
    // rule for 02:30 has no instant, so this resolves to 03:30 local
    // (04:30 in the UTC+2 that's now in effect).
    const instant = localTimeToInstant(
      { year: 2026, month: 3, day: 29 },
      { hour: 2, minute: 30 },
      "Europe/Belgrade",
    );
    const resolved = DateTime.fromMillis(instant, { zone: "Europe/Belgrade" });
    expect(resolved.hour).toBe(3);
    expect(resolved.minute).toBe(30);
    expect(resolved.offset).toBe(120); // UTC+2 — the post-transition offset
  });

  it("picks the earlier occurrence through the fall-back ambiguity", () => {
    // 2026-10-25 is the day Europe/Belgrade falls back from 03:00 to
    // 02:00, so 02:30 local happens twice. We take the earlier instant.
    const instant = localTimeToInstant(
      { year: 2026, month: 10, day: 25 },
      { hour: 2, minute: 30 },
      "Europe/Belgrade",
    );
    const resolved = DateTime.fromMillis(instant, { zone: "Europe/Belgrade" });
    expect(resolved.hour).toBe(2);
    expect(resolved.minute).toBe(30);
    expect(resolved.offset).toBe(120); // UTC+2 — the earlier (summer-time) occurrence
  });
});

describe("weekdayOf", () => {
  it("matches the 0=Sunday..6=Saturday convention, not Luxon's own 1..7", () => {
    // 2026-03-29 is confirmed (via Luxon itself) to be a Sunday.
    expect(weekdayOf({ year: 2026, month: 3, day: 29 }, "UTC")).toBe(0);
    // 2026-03-30 is the Monday after.
    expect(weekdayOf({ year: 2026, month: 3, day: 30 }, "UTC")).toBe(1);
    // 2026-04-04 is the following Saturday.
    expect(weekdayOf({ year: 2026, month: 4, day: 4 }, "UTC")).toBe(6);
  });
});

describe("addDays", () => {
  it("adds calendar days across a DST boundary without being affected by it", () => {
    expect(addDays({ year: 2026, month: 3, day: 28 }, 2)).toEqual({
      year: 2026,
      month: 3,
      day: 30,
    });
  });

  it("rolls over a month boundary", () => {
    expect(addDays({ year: 2026, month: 3, day: 30 }, 3)).toEqual({
      year: 2026,
      month: 4,
      day: 2,
    });
  });
});

describe("calendarDateOf", () => {
  it("returns the calendar date an instant falls on, in the given zone", () => {
    // 2026-03-29T23:30:00Z is still 2026-03-30 local in Europe/Belgrade (+02:00 post-transition, i.e. 01:30 local).
    const instant = DateTime.fromISO("2026-03-29T23:30:00.000Z").toMillis();
    expect(calendarDateOf(instant, "Europe/Belgrade")).toEqual({ year: 2026, month: 3, day: 30 });
    expect(calendarDateOf(instant, "UTC")).toEqual({ year: 2026, month: 3, day: 29 });
  });
});
